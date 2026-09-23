"""
Excavator Anomaly Detection - Multi-model Stacked Ensemble
==========================================================
CAT Smart Operator Assistant (single-file ML pipeline)

ML scenarios handled:
    NORMAL, OVERHEATING, HIGH_VIBRATION, ABNORMAL_FUEL_CONSUMPTION, EXCESSIVE_IDLE
    + UNKNOWN_ANOMALY  (the unsupervised models flag something the classifier doesn't recognise)
(SEATBELT_VIOLATION, PROXIMITY_HAZARD, MACHINE_OFFLINE are single-flag / location /
 missing-data checks and belong in the rule layer, not in this model.)

Ensemble
    Layer 1a  Unsupervised, trained on NORMAL rows only:
              Isolation Forest, Local Outlier Factor, Autoencoder
    Layer 1b  Supervised scenario classifier (soft vote):
              XGBoost, LightGBM, Random Forest
    Layer 2   Logistic-regression meta-learner stacked on out-of-fold predictions
              (folds = machines) -> final anomaly probability + scenario

Usage
    pip install pandas numpy scikit-learn xgboost lightgbm joblib
    python anomaly_ensemble.py train   --data anomaly_detection_dataset.csv
    python anomaly_ensemble.py predict --data new_telemetry.csv --out predictions.csv

    # live, one reading at a time (e.g. inside your MQTT / API code)
    from anomaly_ensemble import StreamDetector
    det = StreamDetector("models/ensemble.joblib")
    result = det.predict_one(reading_dict)
"""
from __future__ import annotations

import argparse
import json
import time
from collections import deque
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (classification_report, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.neighbors import LocalOutlierFactor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import LabelEncoder, StandardScaler
from xgboost import XGBClassifier

# =============================================================================
# 1. CONFIG
# =============================================================================
SEED = 42
ML_SCENARIOS = ["NORMAL", "OVERHEATING", "HIGH_VIBRATION",
                "ABNORMAL_FUEL_CONSUMPTION", "EXCESSIVE_IDLE"]
UNKNOWN = "UNKNOWN_ANOMALY"
STATES = ["IDLE", "STARTING", "OPERATING", "LOADING", "UNLOADING", "TRANSPORTING"]

# Raw sensors used by the model. Cumulative counters (engineHours, fuelLevelLitres,
# fuelConsumedLitres, loadCycles) are excluded: they encode *when* in the shift a
# reading happened, not machine health, and would let the model cheat.
SENSORS = ["engineRpm", "fuelConsumptionRateLph", "engineTemperature",
           "hydraulicTemperature", "vibration"]

SAMPLE_PERIOD_S = 4       # simulator publishes every 4 s
ROLL_WINDOW = 15          # 15 readings = 60 s
TREND_LAG = 15
UNKNOWN_CONF = 0.30       # classifier confidence below this -> UNKNOWN_ANOMALY
VOTE_PCT = 0.995          # a detector "votes" anomaly above this percentile of normal
VOTES_NEEDED = 2          # >= 2 of 3 unsupervised votes flags a reading even if the
                          # classifier disagrees (catches fault types never seen in training)

UNSUP_NAMES = ["isolation_forest", "lof", "autoencoder"]
CLF_NAMES = ["xgboost", "lightgbm", "random_forest"]


# =============================================================================
# 2. FEATURE ENGINEERING  (one code path for training AND live inference)
# =============================================================================
def fit_baselines(df: pd.DataFrame) -> dict:
    """Median and robust spread of each sensor per machine state, from NORMAL rows."""
    normal = df[df["scenario"] == "NORMAL"]
    base = {}
    for state, g in normal.groupby("state"):
        base[state] = {}
        for c in SENSORS:
            med = float(g[c].median())
            iqr = float(g[c].quantile(0.75) - g[c].quantile(0.25))
            spread = max(iqr / 1.349, float(g[c].std() or 0), 0.05 * abs(med), 1e-3)
            base[state][c] = {"median": med, "spread": spread}
    overall = {c: {"median": float(normal[c].median()),
                   "spread": max(float(normal[c].std()), 1e-3)} for c in SENSORS}
    for s in STATES:
        base.setdefault(s, overall)
    return base


FEATURES = (
    [f"state_{s}" for s in STATES] + SENSORS + [f"z_{c}" for c in SENSORS] + [
        "fuel_ratio",          # fuel rate / normal fuel rate for this state   (fuel x1.6 -> 1.6)
        "vib_ratio",           # vibration / normal vibration for this state
        "idle_rate_per_min",   # how fast idleTime is growing
        "idle_streak_s",       # seconds continuously in IDLE
        "idle_rpm_excess",     # RPM above normal idle RPM while idling
        "roll_mean_z_engineTemperature", "roll_mean_z_hydraulicTemperature",
        "roll_mean_vib_ratio", "roll_max_vib_ratio", "roll_std_vibration",
        "roll_mean_fuel_ratio",
        "engine_temp_trend",   # change over the last 60 s
    ]
)


def _to_seconds(ts) -> float:
    return float(ts) if isinstance(ts, (int, float)) else pd.Timestamp(ts).timestamp()


class MachineFeatureState:
    """Keeps the short history of ONE machine and turns each reading into features."""

    def __init__(self, baselines: dict):
        self.base = baselines
        self.hist = deque(maxlen=max(ROLL_WINDOW, TREND_LAG + 1))
        self.prev_ts = self.prev_idle = None
        self.idle_streak_s = 0.0
        self.idle_rate = 0.0

    def update(self, r: dict) -> dict:
        state = r.get("state") if r.get("state") in STATES else "IDLE"
        b = self.base[state]
        ts = _to_seconds(r["timestamp"])
        dt = SAMPLE_PERIOD_S if self.prev_ts is None else max(ts - self.prev_ts, 1e-6)

        f = {f"state_{s}": float(s == state) for s in STATES}
        for c in SENSORS:
            v = float(r[c])
            f[c] = v
            f[f"z_{c}"] = (v - b[c]["median"]) / b[c]["spread"]
        f["fuel_ratio"] = float(r["fuelConsumptionRateLph"]) / max(b["fuelConsumptionRateLph"]["median"], 1e-3)
        f["vib_ratio"] = float(r["vibration"]) / max(b["vibration"]["median"], 1e-3)

        idle = float(r.get("idleTime", 0.0))
        if self.prev_idle is not None and dt < 10 * SAMPLE_PERIOD_S:
            self.idle_rate = max(idle - self.prev_idle, 0.0) / (dt / 60.0)
        f["idle_rate_per_min"] = self.idle_rate
        self.idle_streak_s = (self.idle_streak_s + dt if self.prev_ts is not None else 0.0) \
            if state == "IDLE" else 0.0
        f["idle_streak_s"] = self.idle_streak_s
        f["idle_rpm_excess"] = (float(r["engineRpm"]) - self.base["IDLE"]["engineRpm"]["median"]) \
            if state == "IDLE" else 0.0

        self.hist.append(f.copy())
        win = list(self.hist)[-ROLL_WINDOW:]
        vr = [h["vib_ratio"] for h in win]
        f["roll_mean_z_engineTemperature"] = float(np.mean([h["z_engineTemperature"] for h in win]))
        f["roll_mean_z_hydraulicTemperature"] = float(np.mean([h["z_hydraulicTemperature"] for h in win]))
        f["roll_mean_vib_ratio"] = float(np.mean(vr))
        f["roll_max_vib_ratio"] = float(np.max(vr))
        f["roll_std_vibration"] = float(np.std([h["vibration"] for h in win]))
        f["roll_mean_fuel_ratio"] = float(np.mean([h["fuel_ratio"] for h in win]))
        f["engine_temp_trend"] = (f["engineTemperature"] - self.hist[-1 - TREND_LAG]["engineTemperature"]
                                  if len(self.hist) > TREND_LAG else 0.0)

        self.prev_ts, self.prev_idle = ts, idle
        return f


def build_features(df: pd.DataFrame, baselines: dict) -> pd.DataFrame:
    """Batch features: replays each machine in time order through MachineFeatureState.
    `df` must already be sorted by machineId, timestamp."""
    rows = [None] * len(df)
    pos = {idx: i for i, idx in enumerate(df.index)}
    for _, g in df.groupby("machineId", sort=False):
        st = MachineFeatureState(baselines)
        for idx, rec in zip(g.index, g.to_dict("records")):
            rows[pos[idx]] = st.update(rec)
    return pd.DataFrame(rows, index=df.index)[FEATURES]


# =============================================================================
# 3. MODELS
# =============================================================================
class Calibrator:
    """Raw anomaly score -> percentile among NORMAL training scores (0..1)."""

    def fit(self, normal_scores):
        self.ref = np.sort(np.asarray(normal_scores))
        return self

    def transform(self, s):
        return np.searchsorted(self.ref, s, side="right") / len(self.ref)


class UnsupervisedDetectors:
    """Isolation Forest + LOF + Autoencoder, trained on NORMAL data only."""

    def fit(self, X_normal: np.ndarray):
        self.scaler = StandardScaler().fit(X_normal)
        Z = self.scaler.transform(X_normal)
        n = Z.shape[1]
        self.iso = IsolationForest(n_estimators=300, random_state=SEED, n_jobs=-1).fit(Z)
        self.lof = LocalOutlierFactor(n_neighbors=35, novelty=True, n_jobs=-1).fit(Z)
        self.ae = MLPRegressor(hidden_layer_sizes=(max(n // 2, 8), max(n // 4, 4), max(n // 2, 8)),
                               max_iter=400, early_stopping=True, random_state=SEED).fit(Z, Z)
        self.cal = {k: Calibrator().fit(v) for k, v in self._raw(Z).items()}
        return self

    def _raw(self, Z):
        return {"isolation_forest": -self.iso.score_samples(Z),          # higher = more anomalous
                "lof": -self.lof.score_samples(Z),
                "autoencoder": np.mean((self.ae.predict(Z) - Z) ** 2, axis=1)}

    def score(self, X: np.ndarray) -> pd.DataFrame:
        raw = self._raw(self.scaler.transform(X))
        return pd.DataFrame({k: self.cal[k].transform(v) for k, v in raw.items()})


class ScenarioClassifier:
    """XGBoost + LightGBM + Random Forest, soft-voting over the ML scenarios."""

    def fit(self, X: np.ndarray, y: np.ndarray):
        self.le = LabelEncoder().fit(ML_SCENARIOS)
        yi, k = self.le.transform(y), len(ML_SCENARIOS)
        self.models = {
            "xgboost": XGBClassifier(n_estimators=300, max_depth=5, learning_rate=0.08,
                                     subsample=0.9, colsample_bytree=0.9, objective="multi:softprob",
                                     num_class=k, eval_metric="mlogloss", random_state=SEED, n_jobs=-1),
            "lightgbm": LGBMClassifier(n_estimators=300, num_leaves=31, learning_rate=0.05,
                                       class_weight="balanced", random_state=SEED, verbose=-1, n_jobs=-1),
            "random_forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2,
                                                    class_weight="balanced", random_state=SEED, n_jobs=-1),
        }
        for m in self.models.values():
            m.fit(X, yi)
        return self

    def proba_of(self, name: str, X: np.ndarray) -> np.ndarray:
        m, k = self.models[name], len(self.le.classes_)
        full = np.zeros((len(X), k))
        full[:, m.classes_] = m.predict_proba(X)
        return full

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return np.mean([self.proba_of(n, X) for n in self.models], axis=0)

    @property
    def classes(self):
        return list(self.le.classes_)


class AnomalyEnsemble:
    """Stacked ensemble: 3 unsupervised + 3 supervised models -> logistic meta-learner."""

    def _meta_X(self, unsup: pd.DataFrame, proba: np.ndarray, classes: list) -> np.ndarray:
        return np.column_stack([unsup[n].values for n in UNSUP_NAMES]
                               + [1.0 - proba[:, classes.index("NORMAL")]])

    def fit(self, X: pd.DataFrame, y: pd.Series, groups: pd.Series):
        self.feature_names = list(X.columns)
        Xv, y, g = X.values, np.asarray(y), np.asarray(groups)
        y_bin = (y != "NORMAL").astype(int)

        # out-of-fold base-model predictions, leaving one machine out at a time
        oof = np.zeros((len(Xv), len(UNSUP_NAMES) + 1))
        for held in np.unique(g):
            tr, te = g != held, g == held
            u = UnsupervisedDetectors().fit(Xv[tr & (y == "NORMAL")])
            c = ScenarioClassifier().fit(Xv[tr], y[tr])
            oof[te] = self._meta_X(u.score(Xv[te]), c.predict_proba(Xv[te]), c.classes)

        # meta-learner + threshold (middle of the best-F1 plateau)
        self.meta = LogisticRegression(class_weight="balanced", max_iter=1000).fit(oof, y_bin)
        p = self.meta.predict_proba(oof)[:, 1]
        grid = np.linspace(0.2, 0.8, 61)
        f1s = np.array([f1_score(y_bin, p >= t) for t in grid])
        best = np.flatnonzero(f1s >= f1s.max() - 1e-9)
        self.threshold = float(grid[best[len(best) // 2]])
        self.stack_info = {"threshold": self.threshold, "oof_f1": round(float(f1s.max()), 4),
                           "meta_weights": dict(zip(UNSUP_NAMES + ["classifier"],
                                                    self.meta.coef_[0].round(3).tolist()))}

        # final base models on all training data
        self.unsup = UnsupervisedDetectors().fit(Xv[y == "NORMAL"])
        self.clf = ScenarioClassifier().fit(Xv, y)
        return self

    def predict(self, X: pd.DataFrame) -> pd.DataFrame:
        Xv = X[self.feature_names].values
        unsup = self.unsup.score(Xv)
        proba = self.clf.predict_proba(Xv)
        classes = self.clf.classes
        p_anom = self.meta.predict_proba(self._meta_X(unsup, proba, classes))[:, 1]
        votes = (unsup[UNSUP_NAMES].values >= VOTE_PCT).sum(axis=1)
        is_anom = (p_anom >= self.threshold) | (votes >= VOTES_NEEDED)

        anom_idx = np.array([i for i, c in enumerate(classes) if c != "NORMAL"])
        best = anom_idx[np.argmax(proba[:, anom_idx], axis=1)]
        best_p = proba[np.arange(len(Xv)), best]
        scen = np.where(~is_anom, "NORMAL",
                        np.where(best_p < UNKNOWN_CONF, UNKNOWN, np.array(classes)[best]))

        out = pd.DataFrame({"is_anomaly": is_anom,
                            "anomaly_probability": p_anom.round(4),
                            "unsup_votes": votes,
                            "predicted_scenario": scen,
                            "scenario_confidence": np.where(is_anom, best_p,
                                                            proba[:, classes.index("NORMAL")]).round(4)},
                           index=X.index)
        for n in UNSUP_NAMES:
            out[f"score_{n}"] = unsup[n].values.round(4)
        for i, c in enumerate(classes):
            out[f"p_{c}"] = proba[:, i].round(4)
        return out


# =============================================================================
# 4. DATA, EVALUATION, TRAINING
# =============================================================================
def load_data(path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["_ts"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values(["machineId", "_ts"]).reset_index(drop=True)
    if "scenario" in df:
        # any non-ML scenario (seatbelt / proximity / offline) has normal sensor data
        df["ml_label"] = np.where(df["scenario"].isin(ML_SCENARIOS), df["scenario"], "NORMAL")
    return df


def evaluate(ens: AnomalyEnsemble, X: pd.DataFrame, df: pd.DataFrame) -> dict:
    pred = ens.predict(X)
    y_bin = (df["ml_label"] != "NORMAL").astype(int).values
    Xv = X[ens.feature_names].values
    ni = ens.clf.classes.index("NORMAL")

    rows = {}
    for n in UNSUP_NAMES:                                  # each unsupervised model alone
        s = pred[f"score_{n}"].values
        rows[n] = {"roc_auc": roc_auc_score(y_bin, s), "f1": f1_score(y_bin, s >= 0.99)}
    for n in CLF_NAMES:                                    # each classifier alone
        s = 1 - ens.clf.proba_of(n, Xv)[:, ni]
        rows[n] = {"roc_auc": roc_auc_score(y_bin, s), "f1": f1_score(y_bin, s >= 0.5)}
    rows["ENSEMBLE"] = {"roc_auc": roc_auc_score(y_bin, pred["anomaly_probability"]),
                        "f1": f1_score(y_bin, pred["is_anomaly"]),
                        "precision": precision_score(y_bin, pred["is_anomaly"]),
                        "recall": recall_score(y_bin, pred["is_anomaly"])}

    labels = ML_SCENARIOS + [UNKNOWN]
    rep = classification_report(df["ml_label"], pred["predicted_scenario"], labels=labels,
                                output_dict=True, zero_division=0)
    cm = pd.DataFrame(confusion_matrix(df["ml_label"], pred["predicted_scenario"], labels=labels),
                      index=labels, columns=labels)

    # detection delay: seconds from the start of each anomaly episode to the first flag
    delays = []
    d = df.assign(flag=pred["is_anomaly"].values)
    for m, g in d.groupby("machineId"):
        g = g.reset_index(drop=True)
        for _, ep in g.groupby((g["ml_label"] != g["ml_label"].shift()).cumsum()):
            s = ep["ml_label"].iloc[0]
            if s != "NORMAL":
                hit = np.flatnonzero(ep["flag"].values)
                delays.append({"machine": m, "scenario": s,
                               "delay_s": hit[0] * SAMPLE_PERIOD_S if len(hit) else None,
                               "episode_recall": round(float(ep["flag"].mean()), 3)})

    print("\n--- Binary: anomaly vs normal (each model vs. ensemble) ---")
    print(pd.DataFrame(rows).T.round(4).fillna("").to_string())
    print("\n--- Per scenario ---")
    print(pd.DataFrame(rep).T.loc[labels, ["precision", "recall", "f1-score", "support"]].round(3).to_string())
    print("\n--- Confusion matrix (rows = true, cols = predicted) ---")
    print(cm.to_string())
    print("\n--- Detection delay ---")
    print(pd.DataFrame(delays).to_string(index=False))

    return {"binary": pd.DataFrame(rows).T.round(4).to_dict(orient="index"),
            "per_scenario": rep, "confusion_matrix": cm.to_dict(), "detection_delay": delays}, pred


def train(data_path: str, out_dir: str = "models", test_machine: str | None = None):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    df = load_data(data_path)
    machines = sorted(df["machineId"].unique())
    test_machine = test_machine or machines[-1]
    print(f"Rows: {len(df):,} | machines: {machines}")
    print("Scenarios:", df["scenario"].value_counts().to_dict())

    # ---- honest evaluation: hold out one whole machine
    tr = df[df.machineId != test_machine]
    te = df[df.machineId == test_machine]
    t0 = time.time()
    base = fit_baselines(tr)
    Xtr, Xte = build_features(tr, base), build_features(te, base)
    ens = AnomalyEnsemble().fit(Xtr, tr["ml_label"], tr["machineId"])
    print(f"\nTrained on {sorted(tr.machineId.unique())} in {time.time() - t0:.1f}s | "
          f"testing on unseen machine {test_machine}")
    print("Stacking:", ens.stack_info)
    report, pred = evaluate(ens, Xte, te)
    report["stacking"] = ens.stack_info
    (out / "evaluation_report.json").write_text(json.dumps(report, indent=2, default=str))
    te.drop(columns="_ts").join(pred).to_csv(out / f"test_predictions_{test_machine}.csv", index=False)

    # ---- final model on ALL machines for deployment
    base_all = fit_baselines(df)
    final = AnomalyEnsemble().fit(build_features(df, base_all), df["ml_label"], df["machineId"])
    bundle = {"ensemble": final, "baselines": base_all,
              "meta": {"trained_on": machines, "rows": len(df), "features": FEATURES,
                       "threshold": final.threshold, "stacking": final.stack_info,
                       "trained_at": pd.Timestamp.now("UTC").isoformat()}}
    joblib.dump(bundle, out / "ensemble.joblib", compress=3)
    print(f"\nSaved {out / 'ensemble.joblib'}  (threshold {final.threshold:.2f})")


# =============================================================================
# 5. INFERENCE
# =============================================================================
def predict_csv(data_path: str, model_path: str = "models/ensemble.joblib", out_path: str | None = None):
    bundle = joblib.load(model_path)
    df = load_data(data_path)
    pred = bundle["ensemble"].predict(build_features(df, bundle["baselines"]))
    res = df.drop(columns="_ts").join(pred)
    if out_path:
        res.to_csv(out_path, index=False)
        print(f"Wrote {out_path}")
    print(res["predicted_scenario"].value_counts().to_string())
    return res


class StreamDetector:
    """Live use: call predict_one() for every telemetry message (any machine).

    Keeps a small history per machine for the rolling features and only reports
    `confirmed=True` when K of the last N readings are anomalous (removes blips).
    """

    def __init__(self, model_path: str = "models/ensemble.joblib", k: int = 3, n: int = 5):
        b = joblib.load(model_path)
        self.ens, self.base, self.k, self.n = b["ensemble"], b["baselines"], k, n
        for m in self.ens.clf.models.values():           # single-row inference: no thread pools
            m.set_params(n_jobs=1)
        self.ens.unsup.iso.set_params(n_jobs=1)
        self.ens.unsup.lof.n_jobs = 1
        self.state: dict[str, MachineFeatureState] = {}
        self.flags: dict[str, deque] = {}
        self.recent: dict[str, deque] = {}

    def predict_one(self, reading: dict) -> dict:
        m = reading["machineId"]
        fs = self.state.setdefault(m, MachineFeatureState(self.base))
        feats = fs.update(reading)
        p = self.ens.predict(pd.DataFrame([feats])).iloc[0].to_dict()

        flags = self.flags.setdefault(m, deque(maxlen=self.n))
        recent = self.recent.setdefault(m, deque(maxlen=self.n))
        flags.append(bool(p["is_anomaly"]))
        if p["is_anomaly"]:
            recent.append(p["predicted_scenario"])
        confirmed = sum(flags) >= self.k
        scenario = max(set(recent), key=list(recent).count) if confirmed and recent else "NORMAL"

        return {"machineId": m, "timestamp": reading["timestamp"], "state": reading.get("state"),
                "is_anomaly": bool(p["is_anomaly"]), "confirmed": confirmed, "scenario": scenario,
                "anomaly_probability": float(p["anomaly_probability"]),
                "scenario_confidence": float(p["scenario_confidence"]),
                "unsup_votes": int(p["unsup_votes"]),
                "model_scores": {n: float(p[f"score_{n}"]) for n in UNSUP_NAMES},
                "reasons": self._reasons(feats)}

    def _reasons(self, f: dict, top: int = 3) -> list[str]:
        state = next(s for s in STATES if f[f"state_{s}"] == 1.0)
        items = [(abs(f[f"z_{c}"]), f"{c} {f[c]:.2f} vs normal {self.base[state][c]['median']:.2f} ({state})")
                 for c in SENSORS if abs(f[f"z_{c}"]) >= 2]
        if f["idle_streak_s"] >= 120:
            items.append((f["idle_streak_s"] / 60, f"idling for {f['idle_streak_s'] / 60:.1f} min"))
        return [t for _, t in sorted(items, reverse=True)[:top]]


# =============================================================================
# 6. CLI
# =============================================================================
if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Excavator anomaly detection ensemble")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--data", default="anomaly_detection_dataset.csv")
    t.add_argument("--out-dir", default="models")
    t.add_argument("--test-machine", default=None, help="machine held out for evaluation (default: last)")
    p = sub.add_parser("predict")
    p.add_argument("--data", required=True)
    p.add_argument("--model", default="models/ensemble.joblib")
    p.add_argument("--out", default="predictions.csv")
    a = ap.parse_args()

    # Import this file as a module so the saved model references
    # `anomaly_ensemble.AnomalyEnsemble` (not `__main__.AnomalyEnsemble`) and
    # can be loaded later from your API / MQTT / dashboard code.
    import anomaly_ensemble as ae

    if a.cmd == "train":
        ae.train(a.data, a.out_dir, a.test_machine)
    else:
        ae.predict_csv(a.data, a.model, a.out)
