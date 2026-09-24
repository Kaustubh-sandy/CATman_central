# ETA Module (`backend/src/ml/eta/`)

Machine-learning module that predicts **how many minutes a machine needs to complete its current operational cycle (ETA)** from live telemetry, and explains **why** the model predicted that number.

> **How to read this document.** Everything described as *implemented* was checked against the code and data in this directory. Numbers (dataset sizes, statistics, metrics, sample outputs) were obtained by running the repository's own scripts (`analyze_dataset.js`, `train_model.py`, `predict.py`) or by reading the CSVs and the saved `.joblib` artifact. Anything not in the code is explicitly marked **Planned / not implemented**.

---

## Table of contents

1. [Overview](#1-overview)
2. [Folder structure](#2-folder-structure)
3. [Dataset generation](#3-dataset-generation)
4. [Dataset analysis (EDA)](#4-dataset-analysis-eda)
5. [Dataset details](#5-dataset-details)
6. [Feature explanations](#6-feature-explanations)
7. [Train / validation / test split](#7-train--validation--test-split)
8. [Model architecture](#8-model-architecture)
9. [Preprocessing](#9-preprocessing)
10. [Model evaluation](#10-model-evaluation)
11. [Model artifact](#11-model-artifact)
12. [Prediction flow (`predict.py`)](#12-prediction-flow-predictpy)
13. [Explainability / SHAP](#13-explainability--shap)
14. [Why permutation SHAP](#14-why-permutation-shap)
15. [One-hot encoding + SHAP aggregation](#15-one-hot-encoding--shap-aggregation)
16. [Noise filtering](#16-noise-filtering)
17. [Example end-to-end prediction](#17-example-end-to-end-prediction)
18. [Integration with Node.js](#18-integration-with-nodejs)
19. [How to run](#19-how-to-run)
20. [Key Design Decisions](#20-key-design-decisions)
21. [Limitations and future improvements](#21-limitations-and-future-improvements)
22. [Likely Review Questions](#22-likely-review-questions)

---

## 1. Overview

### What the module does
Given one snapshot of machine telemetry (machine ID, state, scenario, engine hours, fuel, load cycles, idle time, RPM, temperatures, vibration, seatbelt status), the module returns:

1. **`eta_minutes`** – the predicted time (in minutes) to complete the current operational cycle.
2. **`explanation`** – a short list of the factors that pushed this particular prediction up or down, each with an impact in minutes.

### Why ETA prediction is needed / what problem it solves
A fixed ETA (e.g. "every cycle takes 25 minutes") ignores the machine's actual condition. In practice, an overheating machine, a machine with high vibration, or one with lots of idle time will take longer. A learned model can capture these combined, non-linear effects and give a per-machine, per-moment estimate that an operator or supervisor can plan around.

### Input and output
| | Description |
|---|---|
| **Input** | One JSON object with 13 telemetry fields (see [§6](#6-feature-explanations)) |
| **Output** | JSON: `{ "eta_minutes": <float>, "explanation": [ {factor, impact_minutes, direction}, ... ] }` |

### Why explainability was added
A bare number ("ETA = 22.81 min") is hard to trust or act on. The SHAP explanation answers *"what made the ETA longer or shorter than a typical case?"*, so the frontend can show **ETA + Why**.

### Overall flow

```text
Telemetry
    ↓
ETA feature input (13 fields)
    ↓
Preprocessing (ColumnTransformer: passthrough numerics + one-hot categoricals)
    ↓
ML regression model (HistGradientBoostingRegressor)
    ↓
ETA prediction
    ↓
SHAP explanation (permutation SHAP, one-hot contributions aggregated per original feature)
    ↓
ETA + Why
```

**Implementation status:** the Python side (training, prediction, explanation) is fully implemented. The Node.js side that would call `predict.py` is **not implemented in this repository yet** (see [§18](#18-integration-with-nodejs)).

---

## 2. Folder structure

```text
backend/src/ml/eta/
├── __pycache__/                 (auto-generated Python bytecode; not source)
├── analyze_dataset.js
├── data/
│   ├── generate_dataset.js
│   ├── test.csv
│   ├── train.csv
│   └── validation.csv
├── eta_explainer.py
├── model/
│   └── eta_model.joblib
├── predict.py
└── train_model.py
```

| Path | Responsibility |
|---|---|
| `data/generate_dataset.js` | Generates 50,000 synthetic telemetry+ETA rows with a seeded RNG, shuffles them, and writes `train.csv` / `validation.csv` / `test.csv` (70/15/15). |
| `data/train.csv` | 35,000 rows. Used to **fit** the model (and as the SHAP background source at inference). |
| `data/validation.csv` | 7,500 rows. Evaluated after training (see [§10](#10-model-evaluation)). |
| `data/test.csv` | 7,500 rows. Held-out final evaluation; never used for fitting. |
| `analyze_dataset.js` | Node script (no dependencies) that prints dataset sizes, schema, missing values, per-feature statistics, categorical values, correlation with ETA, and ETA distribution (train set). |
| `train_model.py` | Loads the three CSVs, builds the preprocessing + model pipeline, trains, prints validation/test metrics, saves the artifact. |
| `model/eta_model.joblib` | Saved artifact: the fitted pipeline plus metadata and metrics ([§11](#11-model-artifact)). |
| `predict.py` | CLI entry point. Takes one telemetry JSON argument, prints one JSON result (ETA + explanation) or an error JSON. |
| `eta_explainer.py` | `ETAExplainer` class: computes permutation SHAP values, groups one-hot columns back into original features, renames, filters and sorts them. |
| `__pycache__/` | Python bytecode cache; safe to ignore/regenerate. |

Related file outside this folder: `requirements-ml.txt` at the repository root (Python dependencies — see the note in [§19](#19-how-to-run) about `shap`).

---

## 3. Dataset generation

**File:** `data/generate_dataset.js` (plain Node.js, `fs` + `path` only).

### Why synthetic data
The code generates the dataset itself; there is no real operational ETA log in the repository. Synthetic data lets the team build and demonstrate the whole ML + explainability pipeline before real historical data exists. (This is a reasonable purpose; the code does not state further motivation.)

### Configuration (from the code)
| Setting | Value |
|---|---|
| `TOTAL_SAMPLES` | 50,000 |
| Split ratios | 0.70 / 0.15 / 0.15 |
| `SEED` | 42 (custom linear congruential generator, so runs are seeded/reproducible) |
| Machines | `EXC001`, `EXC002`, `EXC003` |
| States | `IDLE`, `STARTING`, `RUNNING`, `LOADING`, `STOPPING` (each chosen uniformly at random) |
| Scenarios | `NORMAL`, `SEATBELT_VIOLATION`, `EXCESSIVE_IDLE`, `OVERHEATING`, `HIGH_VIBRATION`, `PROXIMITY_HAZARD`, `ABNORMAL_FUEL_CONSUMPTION` |

**Scenario selection:** 78% `NORMAL`; otherwise one of the six abnormal scenarios chosen uniformly.

### How telemetry is generated
Base values (uniform random unless noted):

| Field | Generation |
|---|---|
| `engineHours` | uniform 800–4000 |
| `fuelLevelLitres` | uniform 40–320 (later clamped to 5–320) |
| `fuelConsumptionRateLph` | uniform 3–15 |
| `loadCycles` | integer 5–250 |
| `idleTime` | uniform 0.05–2.5 |
| `engineRpm` | depends on state: IDLE 250–450, STARTING 450–900, RUNNING 900–1700, LOADING 1200–1800, STOPPING 500–1000 |
| `engineTemperature` | uniform 68–92 + machine offset |
| `hydraulicTemperature` | uniform 60–85 |
| `vibration` | uniform 0.12–0.65 + machine offset |
| `seatbeltStatus` | `true` by default |

Machine profiles (small deliberate differences):

| Machine | efficiency | temperatureOffset | vibrationOffset |
|---|---|---|---|
| EXC001 | 1.00 | 0 | 0 |
| EXC002 | 0.97 | +1.5 | +0.02 |
| EXC003 | 1.03 | −1 | −0.01 |

Scenario effects on telemetry:

| Scenario | Effect on generated telemetry |
|---|---|
| `SEATBELT_VIOLATION` | `seatbeltStatus = false` |
| `EXCESSIVE_IDLE` | `idleTime += uniform(2, 8)` |
| `OVERHEATING` | engine temp `+= uniform(10, 25)`, hydraulic temp `+= uniform(5, 15)` |
| `HIGH_VIBRATION` | `vibration += uniform(0.5, 1.5)` |
| `ABNORMAL_FUEL_CONSUMPTION` | fuel consumption `+= uniform(5, 12)` |
| `PROXIMITY_HAZARD` | `engineRpm *= uniform(0.75, 0.9)` |
| `NORMAL` | none |

Values are then clamped to ranges: fuel level 5–320, RPM 0–1800, engine temp 60–125, hydraulic temp 50–115, vibration 0.05–3.

### How ETA is generated (business rules in the code)
The code comment defines ETA as *the estimated number of minutes required for the machine to complete its current operational cycle*. It is computed as a hand-written formula plus noise:

| Step | Rule |
|---|---|
| Base | `eta = 8` |
| State effect | IDLE +12, STARTING +8, RUNNING +5, LOADING +0, STOPPING +10 |
| Workload | `+ loadCycles × 0.035` |
| Engine utilisation | `+ max(0, engineRpm − 1200) × 0.003` |
| Fuel consumption | `+ fuelConsumptionRateLph × 0.35` |
| Idle time | `+ idleTime × 0.8` |
| Engine age | `+ max(0, engineHours − 1000) × 0.0015` |
| Low fuel | if fuel < 60 L: `+ (60 − fuel) × 0.08` |
| Engine temperature | if > 90: `+ (temp − 90) × 0.35` |
| Hydraulic temperature | if > 82: `+ (temp − 82) × 0.25` |
| Vibration | if > 0.6: `+ (vibration − 0.6) × 8` |
| Scenario effect | NORMAL 0, SEATBELT_VIOLATION +3, EXCESSIVE_IDLE +8, OVERHEATING +12, HIGH_VIBRATION +10, PROXIMITY_HAZARD +7, ABNORMAL_FUEL_CONSUMPTION +9 |
| Machine efficiency | `eta /= efficiency` |
| Noise | `+ Normal(0, 2.5)` (Box–Muller) |
| Clamp | 3 ≤ eta ≤ 90 (no generated row hit either bound), rounded to 2 decimals |

After generation, the rows are shuffled (Fisher–Yates using the same seeded RNG) and sliced 35,000 / 7,500 / 7,500.

### Limitations of the synthetic data
- The model can only learn **the rules the generator author wrote** (plus noise). A high score shows the model recovers the formula, **not** that it matches real machine behaviour.
- Feature distributions are mostly uniform and independent (e.g. fuel level is independent of fuel consumption), which is unlike real telemetry.
- `seatbeltStatus` is `false` **only** in `SEATBELT_VIOLATION` rows, so it is perfectly redundant with that scenario.
- The scenario labels are inputs to the model (they are given to the generator *and* to the model as a feature).
- Noise is Gaussian with a fixed σ = 2.5 min; real ETA error is unlikely to be that clean.

**Should it be replaced by real data?** Yes — eventually. Real operational cycle-completion data should replace or at least be used to validate/retrain the model. The generator is a scaffold, not a substitute for ground truth.

---

## 4. Dataset analysis (EDA)

**File:** `analyze_dataset.js`. Run: `node analyze_dataset.js` from this folder. It reads the three CSVs with a small hand-written parser (no external libraries) and prints the sections below. **All statistics are computed on the training set only** (except dataset sizes).

### What it computes
1. Row counts for train / validation / test / total
2. Schema (column names from the train header)
3. Missing-value count per column (train)
4. Per-numeric-column: min, max, mean, standard deviation (population), p25, median, p75
5. Unique values of the categorical columns
6. Pearson correlation of each numeric feature with `eta_minutes` (sorted by absolute value)
7. ETA distribution: min, max, mean, median, std

### Actual results (train set, from running the script)

Dataset sizes: Training **35,000**, Validation **7,500**, Test **7,500**, Total **50,000**. Missing values: **0** in every column.

| Feature | min | max | mean | std | p25 | median | p75 |
|---|---|---|---|---|---|---|---|
| engineHours | 800.27 | 3999.75 | 2402.57 | 925.42 | 1601.55 | 2408.07 | 3204.13 |
| fuelLevelLitres | 40.00 | 319.99 | 179.93 | 80.89 | 110.47 | 179.88 | 249.56 |
| fuelConsumptionRateLph | 3.00 | 26.64 | 9.33 | 3.81 | 6.16 | 9.28 | 12.28 |
| loadCycles | 5 | 250 | 127.40 | 70.91 | 66 | 128 | 189 |
| idleTime | 0.05 | 10.45 | 1.47 | 1.22 | 0.69 | 1.34 | 1.97 |
| engineRpm | 194 | 1800 | 908.96 | 448.70 | 531 | 826 | 1313 |
| engineTemperature | 67.0 | 117.3 | 80.77 | 7.79 | 74.3 | 80.6 | 86.7 |
| hydraulicTemperature | 60.0 | 99.6 | 72.83 | 7.49 | 66.3 | 72.8 | 79.1 |
| vibration | 0.11 | 2.12 | 0.42 | 0.25 | 0.26 | 0.40 | 0.53 |
| **eta_minutes** | 5.34 | 60.86 | 28.63 | 7.58 | 23.51 | 28.01 | 32.85 |

Correlation with `eta_minutes` (Pearson, train):

| Feature | Correlation |
|---|---|
| engineRpm | −0.4399 |
| loadCycles | +0.3161 |
| vibration | +0.3028 |
| fuelConsumptionRateLph | +0.2362 |
| idleTime | +0.2343 |
| engineHours | +0.1883 |
| engineTemperature | +0.1741 |
| hydraulicTemperature | +0.0996 |
| fuelLevelLitres | −0.0145 |

### Observations (interpretation, not code output)
- The script only **prints** results; it makes no automated decisions. The code contains no explicit feature-dropping or transformation step based on the analysis.
- All 13 features are used in `train_model.py`, including `fuelLevelLitres` (near-zero linear correlation). This is consistent with the generator: fuel level only matters non-linearly (a penalty only below 60 L), which Pearson correlation would understate.
- `engineRpm` is *negatively* correlated with ETA even though the generator's RPM term is positive (only above 1200 RPM). This is an artefact of the data: low-RPM states (IDLE, STARTING, STOPPING) carry large state penalties, so low RPM co-occurs with high ETA. A reminder that correlation ≠ per-feature effect (relevant to [§13](#13-explainability--shap)).
- The correlation analysis covers only numeric features; categorical features (state, scenario, machine, seatbelt) are not correlated in this script.

---

## 5. Dataset details

All values below come from the actual CSVs in `data/`.

### Size and shape
| File | Rows | Columns |
|---|---|---|
| `train.csv` | 35,000 | 14 (13 features + target) |
| `validation.csv` | 7,500 | 14 |
| `test.csv` | 7,500 | 14 |
| **Total** | **50,000** | |

### Columns and types (as loaded by pandas)
| Column | Type | Kind |
|---|---|---|
| machineId | string | categorical |
| state | string | categorical |
| scenario | string | categorical |
| engineHours | float | numeric |
| fuelLevelLitres | float | numeric |
| fuelConsumptionRateLph | float | numeric |
| loadCycles | integer | numeric |
| idleTime | float | numeric |
| engineRpm | integer | numeric |
| engineTemperature | float | numeric |
| hydraulicTemperature | float | numeric |
| vibration | float | numeric |
| seatbeltStatus | boolean | categorical (treated as categorical in `train_model.py`) |
| eta_minutes | float | **target** |

**9 numeric features + 4 categorical features = 13 features.** After one-hot encoding the model sees **26 columns** (9 numeric + 3 machine + 5 state + 7 scenario + 2 seatbelt).

### ETA target statistics
| Split | mean | std | min | 25% | median | 75% | max |
|---|---|---|---|---|---|---|---|
| Train | 28.63 | 7.58 | 5.34 | 23.51 | 28.01 | 32.85 | 60.86 |
| Validation | 28.56 | 7.65 | 5.35 | 23.39 | 27.86 | 32.78 | 62.56 |
| Test | 28.44 | 7.49 | 5.40 | 23.39 | 27.78 | 32.66 | 59.61 |

The three splits have very similar target distributions.

### Category distributions (train)
| Feature | Distribution |
|---|---|
| machineId | EXC001 11,707 (33.4%), EXC003 11,671 (33.3%), EXC002 11,622 (33.2%) |
| state | RUNNING 7,083 (20.2%), STOPPING 7,035 (20.1%), STARTING 6,988 (20.0%), IDLE 6,951 (19.9%), LOADING 6,943 (19.8%) |
| scenario | NORMAL 27,204 (77.7%), EXCESSIVE_IDLE 1,335 (3.8%), PROXIMITY_HAZARD 1,320 (3.8%), ABNORMAL_FUEL_CONSUMPTION 1,317 (3.8%), HIGH_VIBRATION 1,298 (3.7%), SEATBELT_VIOLATION 1,266 (3.6%), OVERHEATING 1,260 (3.6%) |
| seatbeltStatus | true 33,734 (96.4%), false 1,266 (3.6%) |

Validation/test scenario shares are also ~78% NORMAL.

### Mean ETA by category (train) — shows what the generator rules produce
| Group | Mean ETA (min) |
|---|---|
| scenario NORMAL | 26.20 |
| scenario SEATBELT_VIOLATION | 29.28 |
| scenario PROXIMITY_HAZARD | 33.11 |
| scenario EXCESSIVE_IDLE | 37.97 |
| scenario ABNORMAL_FUEL_CONSUMPTION | 37.95 |
| scenario OVERHEATING | 41.69 |
| scenario HIGH_VIBRATION | 42.67 |
| state LOADING / RUNNING / STARTING / STOPPING / IDLE | 22.32 / 26.82 / 29.31 / 31.36 / 33.34 |
| machine EXC003 / EXC001 / EXC002 | 27.69 / 28.61 / 29.61 |

### Important observations
- No missing values in the train set (the check is only run on train by `analyze_dataset.js`).
- Abnormal scenarios are each only ~3.6–3.8% of rows, so the model has ~1,260–1,335 training examples per abnormal scenario.
- Some feature values fall outside the "base" generator ranges because scenario effects were added (e.g. `idleTime` up to 10.45, `fuelConsumptionRateLph` up to 26.64, `vibration` up to 2.12).
- Rows are perfectly balanced across machines and states; this is a property of uniform random choice, not of real fleets.

---

## 6. Feature explanations

| Feature | Kind | What it represents | Why it matters for ETA | How it is processed |
|---|---|---|---|---|
| `machineId` | categorical | Which machine (EXC001–003) | Machines have slightly different efficiency/temperature/vibration profiles in the data | One-hot encoded (3 columns) |
| `state` | categorical | Current machine state: IDLE, STARTING, RUNNING, LOADING, STOPPING | Where the machine is in its cycle strongly changes remaining time | One-hot encoded (5 columns) |
| `scenario` | categorical | Operating scenario / condition label (NORMAL or one of six abnormal ones) | Abnormal conditions add time | One-hot encoded (7 columns) |
| `engineHours` | numeric | Accumulated engine usage (hours) | Older/more-used engines add a small amount of time in the generator | Passed through unchanged |
| `fuelLevelLitres` | numeric | Fuel remaining (litres) | In the generator, low fuel (< 60 L) adds time | Passed through unchanged |
| `fuelConsumptionRateLph` | numeric | Fuel burn rate (litres/hour) | Proxy for workload; higher burn → longer ETA | Passed through unchanged |
| `loadCycles` | numeric | Number of load cycles | Proxy for workload amount | Passed through unchanged |
| `idleTime` | numeric | Accumulated idle time (the code gives no unit) | More idle → longer completion time | Passed through unchanged |
| `engineRpm` | numeric | Engine revolutions per minute | Reflects utilisation and state; very high RPM adds time in the generator | Passed through unchanged |
| `engineTemperature` | numeric | Engine temperature | Above 90 the generator adds a penalty | Passed through unchanged |
| `hydraulicTemperature` | numeric | Hydraulic system temperature | Above 82 the generator adds a penalty | Passed through unchanged |
| `vibration` | numeric | Vibration level | Above 0.6 the generator adds a penalty | Passed through unchanged |
| `seatbeltStatus` | categorical (boolean) | Whether the seatbelt is fastened | Has no direct ETA term in the generator; it only correlates with the `SEATBELT_VIOLATION` scenario (+3 min) | One-hot encoded (`seatbeltStatus_False`, `seatbeltStatus_True`) |

"Why it matters" reflects the rules in `generate_dataset.js`. Real-world relevance of each feature would need to be confirmed with real data.

---

## 7. Train / validation / test split

- **How:** performed in `generate_dataset.js` (not in `train_model.py`). All 50,000 rows are generated, shuffled with the seeded RNG, then sliced 70% / 15% / 15% → 35,000 / 7,500 / 7,500. The split is random (not stratified and not time-based).
- **Why three sets:**

| Set | Purpose |
|---|---|
| Train | Fit the model |
| Validation | Check generalisation during development (e.g. compare settings) |
| Test | One final, unbiased measurement on data the model has never influenced |

- **Why the test set must not be used for training** (or tuning): if the model or its settings are chosen using test data, the test score becomes optimistic and no longer estimates performance on new data.
- **How it is used in this code:** `train_model.py` fits on train only and *reports* validation and test metrics after fitting. It does not perform hyperparameter search, so the validation set is currently used for reporting rather than for tuning. (Note: HistGradientBoosting also holds out an internal 10% of the training data for early stopping — see [§8](#8-model-architecture).)

---

## 8. Model architecture

**File:** `train_model.py`.

```text
Pipeline
├── preprocessor: ColumnTransformer
│   ├── "numeric"      → passthrough      → 9 numeric features
│   └── "categorical"  → OneHotEncoder(handle_unknown="ignore", sparse_output=False) → 4 categorical features
└── model: HistGradientBoostingRegressor(
        learning_rate=0.05,
        max_iter=400,
        max_leaf_nodes=31,
        min_samples_leaf=20,
        l2_regularization=0.5,
        random_state=42)
```

### Why regression
ETA is a continuous quantity (minutes), so predicting it is a **regression** problem (as opposed to classification, which predicts a label).

### Why `HistGradientBoostingRegressor`
The repository does not document why it was chosen or compare alternatives, so the following is the general rationale, not a demonstrated result:
- Handles non-linear effects and interactions (state × scenario × thresholds like "temperature > 90") without manual feature engineering.
- Works well on tabular data with mixed feature types.
- Fast on tens of thousands of rows because it bins numeric features into histograms.
- Needs no feature scaling.

### Gradient boosting in simple terms
The model is a team of small decision trees built one after another. The first tree makes a rough prediction; each next tree is trained to correct the *remaining errors* of the ensemble so far; the final prediction is the sum of all trees' contributions (scaled by the learning rate). Each tree is a set of if/else splits such as "if engineRpm > 1200 and scenario is OVERHEATING → add a bit". Many small corrections capture curved, threshold-like relationships that a straight-line model cannot.

### Hyperparameters (exact, from the code)
| Parameter | Value | Meaning |
|---|---|---|
| `learning_rate` | 0.05 | How much each new tree contributes. Small = slower, more careful learning (needs more trees). |
| `max_iter` | 400 | Maximum number of boosting iterations (trees). |
| `l2_regularization` | 0.5 | Penalty on large leaf values; discourages over-fitting. |
| `random_state` | 42 | Fixes randomness for reproducible training. |
| `max_leaf_nodes` | 31 | Max leaves per tree. Explicitly set, but equals scikit-learn's default. |
| `min_samples_leaf` | 20 | Min samples in a leaf. Explicitly set, but equals scikit-learn's default. |

> **Early stopping (default behaviour, not set in code).** `early_stopping` is left at its default `"auto"`, which turns early stopping **on** for datasets with more than 10,000 rows. Inspecting the saved artifact shows the model actually used **224 iterations**, not 400: training stopped early when the internal validation score stopped improving. So `max_iter=400` is an upper bound.

**These values are not shown to be optimal.** The code contains no hyperparameter search or comparison against other models; they are reasonable, hand-chosen settings.

### Why a Pipeline
Bundling the preprocessor and model into one `Pipeline` guarantees the *same* transformation is applied in training and inference, avoids train/serve mismatch, and lets us save/load a single object.

---

## 9. Preprocessing

```python
ColumnTransformer(transformers=[
    ("numeric",     "passthrough", NUMERIC_FEATURES),
    ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_FEATURES),
])
```

| Group | Columns | Treatment |
|---|---|---|
| Numeric (9) | engineHours, fuelLevelLitres, fuelConsumptionRateLph, loadCycles, idleTime, engineRpm, engineTemperature, hydraulicTemperature, vibration | `passthrough` (no scaling — tree models don't need it) |
| Categorical (4) | machineId, state, scenario, seatbeltStatus | `OneHotEncoder` |

- **Why categorical variables need encoding:** the model works on numbers. Turning `state = "RUNNING"` into a single number (e.g. 3) would falsely imply an ordering/distance between states. One-hot encoding creates one 0/1 column per category (e.g. `state_RUNNING = 1`, other state columns = 0).
- **`handle_unknown="ignore"`:** if a value not seen in training appears at inference (e.g. a new machine `EXC004` or a new state), the encoder outputs all zeros for that feature's columns instead of raising an error. The prediction still works, but the model has no knowledge of that category, so treat such predictions with caution. *(Verified: sending `machineId = "EXC099"` returns a valid prediction.)*
- **`sparse_output=False`:** returns a dense NumPy array. (This keyword requires scikit-learn ≥ 1.2; the repo pins 1.9.1.)
- Extra keys in the input JSON are ignored (the `ColumnTransformer` selects columns by name); **missing** required fields cause an error (see [§12](#12-prediction-flow-predictpy)).

---

## 10. Model evaluation

`train_model.py` computes three metrics for the **validation** and **test** sets using `sklearn.metrics`, prints them, and stores them in the artifact. Re-running the script reproduced the stored values.

| Metric | Validation | Test |
|---|---|---|
| **MAE** | 2.035 min | 2.068 min |
| **RMSE** | 2.549 min | 2.588 min |
| **R²** | 0.8889 | 0.8806 |

Training-set metrics are **not** computed by the script.

| Metric | Plain-language meaning |
|---|---|
| **MAE** (Mean Absolute Error) | On average, the prediction is off by about 2 minutes. Easy to interpret. |
| **RMSE** (Root Mean Squared Error) | Like MAE but penalises large mistakes more heavily. |
| **R²** | Fraction of the ETA variation the model explains (1.0 = perfect, 0 = no better than predicting the mean). ≈0.88 means about 88%. |

### Context for the numbers
- For scale: the ETA standard deviation is ~7.5 min. Always predicting the training mean (28.63 min) would give an MAE of about 5.8 min on the test set (computed separately for this document; the script itself does not compute a baseline).
- The generator adds Gaussian noise with σ = 2.5 min that no model can predict. The test RMSE of 2.588 is close to that floor, which suggests the model recovers most of the deterministic signal. (This is an inference from the generator code.)
- **These metrics measure how well the model recovers a synthetic formula.** They are **not** evidence of accuracy on real machines.
- Validation and test scores are very close (no sign of over-fitting to the validation data), as expected since the split is random and no tuning was done against it.

---

## 11. Model artifact

**File:** `model/eta_model.joblib` (~0.8 MB), written with `joblib.dump`. It is a Python **dictionary**:

| Key | Content |
|---|---|
| `pipeline` | The fitted scikit-learn `Pipeline` (ColumnTransformer + HistGradientBoostingRegressor) |
| `numeric_features` | List of the 9 numeric feature names |
| `categorical_features` | List of the 4 categorical feature names |
| `target` | `"eta_minutes"` |
| `validation_metrics` | `{mae, rmse, r2}` on validation |
| `test_metrics` | `{mae, rmse, r2}` on test |

**Why save the whole pipeline:** at inference, raw telemetry goes straight in; the encoder (with the exact categories learned in training) and model are applied together, so there is no risk of re-implementing preprocessing differently elsewhere.

**Caveat:** joblib/pickle files depend on library versions. The artifact was produced with scikit-learn 1.9.1 (see `requirements-ml.txt`); load it with the same versions, and never load `.joblib` files from untrusted sources (they can execute code).

---

## 12. Prediction flow (`predict.py`)

### Command-line interface
`predict.py` takes **exactly one argument**: a JSON string with the 13 telemetry fields. It prints **one line of JSON** to stdout.

```bash
cd backend/src/ml/eta
python predict.py '{"machineId":"EXC001","state":"RUNNING","scenario":"NORMAL","engineHours":1112.9,"fuelLevelLitres":63.22,"fuelConsumptionRateLph":11.6,"loadCycles":165,"idleTime":0.54,"engineRpm":1000,"engineTemperature":88.5,"hydraulicTemperature":69.6,"vibration":0.37,"seatbeltStatus":true}'
```

(On Windows PowerShell/cmd, JSON quoting differs; escape the inner double quotes or pipe from a file/variable.)

### Step by step
1. **Parse input.** `main()` checks `len(sys.argv) == 2`, then `json.loads(sys.argv[1])`.
2. **Load the model.** `load_model()` runs `joblib.load(model/eta_model.joblib)` and returns `artifact["pipeline"]`.
3. **Create the DataFrame.** `pd.DataFrame([payload])` → one row, columns = JSON keys.
4. **Run inference.** `pipeline.predict(dataframe)[0]` (preprocessing happens inside the pipeline).
5. **Prepare SHAP background.** Reads `data/train.csv`, drops `eta_minutes`, takes `sample(n=50, random_state=42)`.
6. **Explain.** Builds `ETAExplainer(pipeline, background_data)` and calls `.explain(dataframe)`.
7. **Return.** `{"eta_minutes": round(float(prediction), 2), "explanation": [...]}` printed as JSON.

### Output format
```json
{
  "eta_minutes": 22.81,
  "explanation": [
    { "factor": "Engine hours", "impact_minutes": -2.04, "direction": "decrease" }
  ]
}
```

### Error handling
Any exception is caught and printed as `{"error": "<message>"}` with **exit code 1**. Verified cases:

| Situation | Output |
|---|---|
| No argument / more than one argument | `{"error": "Expected telemetry JSON as argument"}` |
| Invalid JSON | `{"error": "Expecting value: line 1 column 1 (char 0)"}` |
| Missing required fields | `{"error": "columns are missing: {...}"}` |

There is no validation of value ranges or types beyond what scikit-learn enforces.

### Practical notes (implementation behaviours worth knowing)
- Every call is a **new Python process** that reloads the model, re-reads `train.csv` and rebuilds the explainer. Measured wall time in the verification sandbox was several seconds per call (~7 s, cold start, including importing `shap`). Timing on your machine will differ; measure it before putting this on a real-time path.
- `predict.py` needs `data/train.csv` at inference time (for the SHAP background), not just the model file.

---

## 13. Explainability / SHAP

**File:** `eta_explainer.py`, class `ETAExplainer(pipeline, background_data)`.

### What SHAP is
SHAP (SHapley Additive exPlanations) uses a concept from game theory (Shapley values) to split a prediction among the input features. Simple version: *start from an "average" prediction, then attribute the difference between the average and this prediction to each feature.*

### Why it is useful for ETA
It tells the operator/supervisor which conditions made this ETA longer or shorter, turning a number into something actionable and inspectable.

### How to read the values
| Concept | Meaning |
|---|---|
| **Positive SHAP value** | This feature pushed the prediction **up** (longer ETA) compared with the baseline. Output as `direction: "increase"`. |
| **Negative SHAP value** | This feature pushed the prediction **down** (shorter ETA). Output as `direction: "decrease"`. |
| **`impact_minutes`** | The SHAP value, rounded to 2 decimals, in the units of the target (minutes). |
| **Baseline** | The average model output over the 50-row background sample. The code does not return the baseline value. |

Because SHAP values are *relative to the baseline*, "Engine hours = −2.04" means "compared with the average background machine, this machine's engine hours lower the ETA by about 2 minutes". In this example engine hours are 1112.9 (background average is ~2,400), and the generator's age term (`max(0, hours − 1000) × 0.0015`) would add ~0.2 min for this machine versus ~2 min for an average one — consistent in magnitude with the −2.04 shown.

### Local explanation
SHAP values here are **local**: computed for this single input. The same feature can have a different (even opposite) impact for another machine's snapshot. They do not describe global feature importance.

### Prediction vs explanation
```text
Prediction:   ETA = 22.81 minutes           (what the model outputs)

Explanation:  Engine hours   = −2.04 min    (how much each factor moved the
              Load cycles    = +1.07 min     prediction relative to the
              ...                            baseline / typical case)
```
The prediction is the *answer*. The explanation is a *breakdown of how the answer differs from the baseline*. Together (plus omitted small terms), SHAP values add up to `prediction − baseline`.

### SHAP values are NOT causal effects
SHAP describes how the **model** uses its inputs, not what would happen in the real world if you changed that input. "Engine hours −2.04" does not mean "reducing engine hours by X will save 2 minutes". Features are also correlated (e.g. `seatbeltStatus` and `scenario` are redundant in this data), so credit can be shared between them arbitrarily. Present the output as "what the model considered", not "what caused the delay".

---

## 14. Why permutation SHAP

```python
self.explainer = shap.Explainer(
    self.model.predict,   # a plain prediction function
    self.background,      # preprocessed background sample
    algorithm="permutation"
)
```

- The explainer is given the model's **`predict` function** and a background dataset rather than the model object itself, so SHAP treats the model as a **black box**.
- `algorithm="permutation"` forces model-agnostic permutation SHAP. Per the project background, direct `shap.Explainer`/TreeExplainer handling of `HistGradientBoostingRegressor` did not work in the original implementation, so this is the practical solution. (I did not re-test TreeExplainer; this reflects the stated project history.)

| Trade-off | Detail |
|---|---|
| ✅ Model-agnostic | Works for any model with a `predict` function; survives a change of model type. |
| ✅ Works with the current setup | Operates on the model's actual preprocessed input. |
| ❌ Slower | It evaluates the model many times per explanation. Exact tree-based SHAP is normally faster. |
| ❌ Small run-to-run variation | Values are estimated from random permutations. Repeated runs of the same input gave the same ETA (22.81) but slightly different impacts (e.g. Engine hours −2.05, −2.07, −2.08). The 2-decimal output can therefore vary by a few hundredths. |
| ❌ Depends on the background | Baseline and attributions depend on the 50 randomly-but-seeded chosen training rows. |

---

## 15. One-hot encoding + SHAP aggregation

The model never sees `state = "RUNNING"`; it sees the encoded columns. `preprocessor.get_feature_names_out()` returns 26 names:

```text
numeric__engineHours ... numeric__vibration                     (9 columns)
categorical__machineId_EXC001 / _EXC002 / _EXC003               (3)
categorical__state_IDLE / _LOADING / _RUNNING / _STARTING / _STOPPING   (5)
categorical__scenario_NORMAL / _OVERHEATING / ... (7 scenarios)  (7)
categorical__seatbeltStatus_False / _True                        (2)
```

SHAP therefore produces one value **per encoded column**. Showing `state_RUNNING`, `state_LOADING`, `scenario_NORMAL` etc. to a user would be confusing and fragmented.

### What the code does
For each (encoded name, value):
1. Strip the `numeric__` / `categorical__` prefix.
2. Map it to an original feature: numeric names stay as-is; names starting with `state_`, `scenario_`, `machineId_`, `seatbeltStatus_` map to `state`, `scenario`, `machineId`, `seatbeltStatus`.
3. **Sum** the SHAP values within each group (SHAP values are additive, so summing keeps the total consistent).
4. Rename with a readable label.

| Original feature | Label shown |
|---|---|
| engineHours | Engine hours |
| fuelLevelLitres | Fuel level |
| fuelConsumptionRateLph | Fuel consumption |
| loadCycles | Load cycles |
| idleTime | Idle time |
| engineRpm | Engine RPM |
| engineTemperature | Engine temperature |
| hydraulicTemperature | Hydraulic temperature |
| vibration | Vibration |
| state | Machine state |
| scenario | Operating scenario |
| machineId | Machine |
| seatbeltStatus | Seatbelt status |

**Why it matters for the frontend:** it gets one stable, human-readable entry per real-world signal (13 possible factors) instead of a variable number of encoded column names. The set of factors is the same for every prediction.

> Note: the grouping logic is hard-coded by name prefix. If a categorical feature is added or renamed, `eta_explainer.py` must be updated (unmatched names fall back to the raw encoded name).

---

## 16. Noise filtering

```python
if abs(value) < 0.10:
    continue
```

After aggregation, any factor whose absolute impact is below **0.10 minutes** is dropped, then the rest are sorted by absolute impact (largest first).

- **Purpose:** presentation/readability. Contributions of a few hundredths of a minute are not useful to show and make the list noisy.
- **This does not mean those features have zero influence.** It means their contribution to *this* prediction was too small to display. Consequently the listed impacts will not sum exactly to `prediction − baseline`.
- The threshold is a hard-coded, hand-chosen constant (0.10 min); it is not derived from data. In the sample below, Fuel level, Hydraulic temperature, Machine and Seatbelt status were filtered out.

---

## 17. Example end-to-end prediction

**Input:**
```json
{
  "machineId": "EXC001",
  "state": "RUNNING",
  "scenario": "NORMAL",
  "engineHours": 1112.9,
  "fuelLevelLitres": 63.22,
  "fuelConsumptionRateLph": 11.6,
  "loadCycles": 165,
  "idleTime": 0.54,
  "engineRpm": 1000,
  "engineTemperature": 88.5,
  "hydraulicTemperature": 69.6,
  "vibration": 0.37,
  "seatbeltStatus": true
}
```
(This happens to be the first row of `train.csv`, whose recorded target is 23.38 min — so it is a *training* example, not unseen data.)

**Output:**
```json
{
  "eta_minutes": 22.81,
  "explanation": [
    { "factor": "Engine hours",       "impact_minutes": -2.04, "direction": "decrease" },
    { "factor": "Operating scenario", "impact_minutes": -1.73, "direction": "decrease" },
    { "factor": "Load cycles",        "impact_minutes":  1.07, "direction": "increase" },
    { "factor": "Engine RPM",         "impact_minutes": -0.96, "direction": "decrease" },
    { "factor": "Fuel consumption",   "impact_minutes":  0.87, "direction": "increase" },
    { "factor": "Machine state",      "impact_minutes": -0.83, "direction": "decrease" },
    { "factor": "Idle time",          "impact_minutes": -0.75, "direction": "decrease" },
    { "factor": "Vibration",          "impact_minutes": -0.18, "direction": "decrease" },
    { "factor": "Engine temperature", "impact_minutes": -0.12, "direction": "decrease" }
  ]
}
```
(Re-running `predict.py` reproduces `eta_minutes: 22.81`; the individual impacts vary by a few hundredths between runs, see [§14](#14-why-permutation-shap).)

**Reading it:** relative to the baseline (the average background case), the model predicts a shorter ETA. The biggest downward pushes are low engine hours, the (normal) scenario, low engine RPM for this state mix and machine state; the biggest upward pushes are relatively high load cycles and fuel consumption. The listed impacts sum to about −4.67 min, which implies a baseline of roughly 27–28 min (the omitted small factors make this approximate).

---

## 18. Integration with Node.js

### Status
**Planned / not implemented in this repository.** No Node.js code currently spawns `predict.py` or references the ETA module (checked by searching `backend/src`). The section below describes the intended architecture and the contract that `predict.py` already fulfils on its side.

### Intended architecture
```text
MQTT
 ↓
Node.js backend
 ↓
Python predict.py        (spawned as a child process, one JSON argument)
 ↓
ETA + explanation JSON
 ↓
Node.js API / WebSocket
 ↓
Frontend
```
**Principle:** the Python module is the **ML source of truth**. Node.js must **not** reimplement the model, preprocessing or SHAP logic; it only builds the input, calls Python and forwards the result.

### Contract
**Request (Node → Python):** one JSON string as the single CLI argument, containing the 13 fields exactly as named in the training data (`machineId`, `state`, `scenario`, `engineHours`, `fuelLevelLitres`, `fuelConsumptionRateLph`, `loadCycles`, `idleTime`, `engineRpm`, `engineTemperature`, `hydraulicTemperature`, `vibration`, `seatbeltStatus`). Categorical values must use the same vocabulary as training (see [§5](#5-dataset-details)); `seatbeltStatus` is a JSON boolean. The mapping from real MQTT telemetry field names to these names has to be done in Node and has **not been verified** here.

**Success response (stdout, exit code 0):**
```json
{ "eta_minutes": 22.81, "explanation": [ { "factor": "...", "impact_minutes": 0.0, "direction": "increase|decrease" } ] }
```
**Failure response (stdout, exit code 1):** `{ "error": "<message>" }`

### Sketch (illustrative, not in the repo)
```js
const { execFile } = require("child_process");
const path = require("path");

function predictEta(telemetry) {
  const script = path.join(__dirname, "ml/eta/predict.py");
  return new Promise((resolve, reject) => {
    execFile("python", [script, JSON.stringify(telemetry)], (err, stdout) => {
      let out; try { out = JSON.parse(stdout); } catch { return reject(err || new Error("Bad output")); }
      out.error ? reject(new Error(out.error)) : resolve(out);
    });
  });
}
```
Because each call takes seconds ([§12](#12-prediction-flow-predictpy)), a production integration should throttle/queue calls or move to a long-running Python process/service (both are **future work**).

---

## 19. How to run

All commands are supported by the repository as-is. Paths are relative to the repository root unless noted.

### Install Python dependencies
```bash
pip install -r requirements-ml.txt
pip install shap
```
> **Note:** `requirements-ml.txt` pins scikit-learn 1.9.1, pandas, numpy, joblib, etc., but **does not list `shap`**, which `eta_explainer.py` imports. Install it separately (verification was done with `shap 0.52.0`) or add it to the requirements file.

### (Optional) Regenerate the dataset
```bash
cd backend/src/ml/eta/data
node generate_dataset.js
```
This overwrites `train.csv`, `validation.csv` and `test.csv`. If you regenerate, retrain afterwards.

### Run dataset analysis
```bash
cd backend/src/ml/eta
node analyze_dataset.js
```

### Train the model
```bash
cd backend/src/ml/eta
python train_model.py
```
Prints dataset sizes, validation and test MAE/RMSE/R² and writes `model/eta_model.joblib`.

### Run a prediction
```bash
cd backend/src/ml/eta
python predict.py '{"machineId":"EXC001","state":"RUNNING","scenario":"NORMAL","engineHours":1112.9,"fuelLevelLitres":63.22,"fuelConsumptionRateLph":11.6,"loadCycles":165,"idleTime":0.54,"engineRpm":1000,"engineTemperature":88.5,"hydraulicTemperature":69.6,"vibration":0.37,"seatbeltStatus":true}'
```

### Testing the prediction
The repository has **no automated test suite** for this module. Manual checks:
- Run the command above and confirm `eta_minutes` is ≈ 22.81 and `explanation` is a non-empty list.
- Confirm errors: `python predict.py` (no argument) → `{"error": "Expected telemetry JSON as argument"}`, exit code 1.
- Unknown category: change `machineId` to `EXC099` → still returns a prediction (see [§9](#9-preprocessing)).

---

## 20. Key Design Decisions

| Decision | What was done | Why (simple version) |
|---|---|---|
| **Synthetic dataset** | 50,000 rows generated by `generate_dataset.js` with a seed | No real ETA history exists yet; lets us build and demo the whole pipeline. Must be replaced/validated with real data later. |
| **Regression formulation** | Predict `eta_minutes` as a number | ETA is a continuous quantity. |
| **Feature selection** | 13 telemetry fields (9 numeric + 4 categorical) | Signals a machine already reports that plausibly relate to cycle time. No feature removal was applied after EDA. |
| **Train/validation/test split** | 70/15/15 random split, done in the generator | Fit on train, sanity-check on validation, report final quality on untouched test data. |
| **ColumnTransformer** | Different handling for numeric vs categorical columns in one object | Keeps preprocessing declarative and tied to column names. |
| **OneHotEncoder** | Categorical → 0/1 columns, `handle_unknown="ignore"`, dense output | Avoids fake ordering between categories; unseen categories don't crash inference. |
| **HistGradientBoostingRegressor** | Boosted trees, lr 0.05, ≤400 iterations, L2 0.5, seed 42 | Handles non-linear thresholds/interactions, fast, no scaling needed. Not benchmarked against alternatives in the repo. |
| **Pipeline** | Preprocessor + model in one object | Same transformations in training and inference. |
| **Joblib artifact** | One `.joblib` dict with pipeline, feature lists, metrics | Simple to load from `predict.py`; carries its own metadata. |
| **SHAP explainability** | Per-prediction feature impacts in minutes | Users see *why* the ETA is what it is. |
| **Permutation SHAP** | `shap.Explainer(model.predict, background, algorithm="permutation")` | Model-agnostic, and it was the approach that worked with this model. Costs more compute. |
| **SHAP aggregation** | Sum one-hot contributions per original feature | Frontend gets one readable factor per real signal. |
| **Explanation filtering** | Drop `abs(impact) < 0.10`, sort by size | Readability; not a claim that dropped features are irrelevant. |
| **Python ML + Node.js integration** | Python owns model/explanations; Node only calls it (planned) | One source of truth; avoids reimplementing ML in JS. |

---

## 21. Limitations and future improvements

### Limitations (based on the actual implementation)
- **Synthetic data:** the model learns the generator's formula. Metrics (R² ≈ 0.88, MAE ≈ 2.07 min on test) say nothing about real-world accuracy.
- **Generalisation:** feature distributions are uniform and independent; real telemetry is correlated, seasonal and messier. Behaviour outside the training ranges (e.g. RPM > 1800, engine hours > 4,000) is untested and tree models do not extrapolate.
- **No real-world validation:** there is no comparison with observed cycle times.
- **Data artefacts:** `seatbeltStatus` is redundant with `scenario`; `scenario` is provided as an *input* to the model, which is only possible if scenarios are known at prediction time; ETA has no dependency on time-history (single-snapshot input).
- **Unknown categories:** accepted silently (all-zeros encoding) — the model gives an answer but with no knowledge about that machine/state/scenario.
- **SHAP cost and variance:** permutation SHAP is slower than tree SHAP and gives slightly different values across runs; `predict.py` reloads everything per call (seconds per prediction).
- **SHAP interpretation:** values are not causal; correlated features split credit; aggregation hides which category (e.g. which scenario) contributed inside a group.
- **Hard-coded pieces:** the 0.10 threshold, the 50-row background sample, and the feature grouping in `eta_explainer.py`.
- **Baseline not exposed:** consumers cannot reconcile explanation values with the ETA because the baseline is not returned.
- **Packaging:** `shap` is missing from `requirements-ml.txt`; no automated tests; no input validation beyond scikit-learn errors.
- **Node.js integration is not implemented.**

### Possible future improvements (none of these are implemented)
- Collect **real operational data** (actual cycle completion times) and retrain/validate; keep synthetic data only for tests/demos.
- Hyperparameter tuning using the validation set and comparison with other models (with the test set kept for the final check).
- Monitoring for **model drift** (compare live feature/error distributions with training) and a scheduled retraining process.
- Faster serving: keep the model and explainer loaded in a long-running Python service, cache the explainer, or evaluate exact tree-based SHAP.
- Return the baseline/expected value with the explanation and fix the random seed for reproducible SHAP output.
- Input validation and clearer errors for out-of-range/unknown categorical values.
- More domain-specific explanation labels (e.g. "High engine temperature" instead of a generic "Engine temperature"), and possibly per-category detail in the state/scenario factor.
- Add automated tests for `predict.py` and the explainer.

---

## 22. Likely Review Questions

**Why ML for ETA?**
A fixed ETA ignores machine condition. A model learns how state, workload, temperatures, vibration and abnormal scenarios combine to change completion time, per machine and per moment.

**Why regression?**
ETA is a continuous number of minutes, not a category.

**Why this model?**
`HistGradientBoostingRegressor` handles non-linear thresholds and interactions on tabular data, is fast, and needs no scaling. We did not benchmark other models in this repo, so we don't claim it is the best — only that it is a suitable fit.

**Why these features?**
They are the telemetry signals the machine reports that plausibly relate to cycle time (workload, condition, state, scenario). In the current dataset all 13 are used; none were removed after EDA.

**Why synthetic data?**
No real ETA history was available; synthetic data allowed us to build and demonstrate training, inference and explainability end to end. It must be replaced or validated with real data.

**Why train/validation/test?**
Train to fit, validation to check generalisation during development, test as a final untouched measurement. The test set is never used for fitting.

**Why one-hot encoding?**
Models need numbers; label-encoding categories would imply a false order. One-hot gives each category its own 0/1 column.

**Why a pipeline?**
So preprocessing and model are always applied together, identically in training and inference, and saved as one artifact.

**Why SHAP?**
It gives a per-prediction breakdown in the same unit as the output (minutes), so users see what made this ETA longer or shorter.

**Why permutation SHAP?**
It treats the model as a black box (via `predict`), and it is what worked with the `HistGradientBoostingRegressor` here when direct tree handling didn't. Trade-off: slower and slightly noisy versus exact tree SHAP.

**What does a positive SHAP value mean?**
That feature pushed this prediction *up* (longer ETA) relative to the baseline; shown as `"increase"`.

**What does a negative SHAP value mean?**
It pushed the prediction *down* (shorter ETA); shown as `"decrease"`.

**Are SHAP values causal?**
No. They explain how the model arrived at its output, not what would happen if a real-world value changed. Correlated features can share credit.

**Why aggregate one-hot features?**
SHAP works on the encoded columns (`state_RUNNING`, etc.). Summing them per original feature gives one readable factor ("Machine state") for the frontend.

**What happens with an unknown category?**
`OneHotEncoder(handle_unknown="ignore")` encodes it as all zeros; the prediction still runs, but the model has never seen that category, so it is less reliable (and SHAP treats it as "none of the known categories").

**How accurate is the model?**
On the synthetic test set: MAE 2.07 min, RMSE 2.59 min, R² 0.88 (validation: 2.03 / 2.55 / 0.89). Close to the generator's own noise (σ = 2.5 min). This is *not* proof of real-world accuracy.

**What are the current limitations?**
Synthetic data and formula-recovery only; no real-world validation; slow per-call permutation SHAP; SHAP is non-causal; hard-coded threshold/background; `shap` missing from requirements; no automated tests; Node.js integration not yet implemented.

**How does Node.js consume the Python model?**
Intended design: Node builds the telemetry JSON from MQTT data, runs `python predict.py '<json>'`, parses the JSON from stdout (`eta_minutes` + `explanation`, or `error`) and forwards it via API/WebSocket. Node never reimplements the model. This calling code is not yet in the repository.