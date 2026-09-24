# AI / ML Plan — what the dataset supports, what exists, what to add

Scope: Expected Outcomes 2 (Safety), 3 (Training Hub) and 4 (Unusual behaviour).
Facts below come from `anomaly_detection_dataset.csv`,
`CATman_central/backend/src/ml/anomaly_ensemble.py`, and the running backend.

---

## 1. What is already there

| Piece | State |
|---|---|
| `ml/anomaly_ensemble.py` | Complete code: state-aware baselines → 25 features → Isolation Forest + LOF + autoencoder (normal-only) and XGBoost + LightGBM + RandomForest (scenario classifier) → logistic meta-learner, leave-one-machine-out. `StreamDetector.predict_one()` returns `confirmed` (3 of the last 5 readings) and `reasons`. |
| `services/anomalyDetection.service.js` | **Empty.** Nothing calls the model. |
| Trained model (`models/ensemble.joblib`) | **Doesn't exist.** `xgboost` and `lightgbm` aren't installed (pandas and scikit-learn are). I have **not** run the training script. |
| Deterministic Safety Engine (`safety.engine.js`) | Live: seatbelt, unattended, lockout, proximity (dynamic zone), rollover, overload, overheating (>105 °C engine / >95 °C hydraulic), low oil, vibration (>0.8 g), impact, fatigue. |
| Gemini assistant | Live, with tools over dashboard data. It has no tool that returns ML findings. |
| Behaviour → training loop | Partial: `RULE_TO_MODULE` maps rule alerts to 4 simulations. |
| Idle | Only a "you've idled 3 min" lesson prompt and the shift's idle minutes. No baseline comparison and no fuel-waste figure. |

Gap: the rules only fire at **hard limits**, and nothing covers **fuel
inefficiency or excessive idling** at all.

## 2. What the dataset can and cannot support

12,600 rows · 3 machines × 4,200 rows (4 s samples, 4 h 40 min, one day) ·
each machine has the same four 300-row (20 min) anomaly episodes.

| Signature in the data | Normal | Anomaly |
|---|---|---|
| OVERHEATING | engine ~78.5 °C (OPERATING) | flat 93 °C engine / 90 °C hydraulic |
| HIGH_VIBRATION | ~0.34 g | flat 1.12 g |
| ABNORMAL_FUEL | 14 L/h (OPERATING) | ~22.4 L/h (≈ ×1.6) |
| EXCESSIVE_IDLE | idle burns ~4 L/h | 300 rows all IDLE at 550 rpm, `idleTime` climbing ~28 min per 20 min |

**Can be built from it**

| Feature (from your brief) | Verdict |
|---|---|
| Overheating / high vibration / abnormal fuel detection | Yes. Also earlier than the rule layer: 93 °C is normal-plus-15 °C for the state, but under the 105 °C rule limit. |
| Excessive idling + fuel wasted | Yes. Idle burn is 4 L/h, so waste = excess idle hours × 4 L/h. |
| Explainable anomalies ("X vs baseline, N× above normal") | Yes. State-aware medians give exact "vs normal" values. |
| Fuel-per-cycle inefficiency | Partly. The `fuelPerLoadCycle` column is broken (up to 182 in NORMAL rows from dividing by tiny cycle counts). Recompute it as fuel and cycles over a rolling window. |
| Per-machine baselines, fleet comparison | Yes. |
| Unknown-fault flagging | Yes, by the unsupervised models' votes. |

**Cannot be built from it**

| Feature | Why |
|---|---|
| Seatbelt, proximity, machine offline as ML | No columns. Correctly left to rules (the file's header already says so). |
| Per-**operator** baselines | No `operatorId`. |
| Trends over days ("violations down in 7 days") | One day only. This needs live history from Firestore. |
| Fatigue, geofence, machine-to-machine distance | No GPS or shift-hours columns. |
| A credible accuracy number | See below. |

**Warning — don't quote accuracy from this dataset.** Every anomaly is a
flat step change. With only scikit-learn, I trained on two machines and
tested on the third: a Random Forest got **100 % on all three** held-out
machines. A raw Isolation Forest got precision 0.43 and recall 0.87 without
calibration. So "the ensemble scored 100 %" tells judges nothing. Also
`idleRatio` is always 0 (drop it).

**Domain shift.** The live simulator ramps overheating (+0.9 °C per tick)
and has scenarios the dataset lacks (rollover, low oil, overload). A model
trained only on the flat CSV may behave differently on live data. Fix in
phase 1.

## 3. Recommended architecture: rules first, ML advises, Gemini explains

```
telemetry (MQTT) ─▶ bus ─┬─▶ Safety Engine (rules)      ── CRITICAL/HIGH/MEDIUM alerts  (unchanged, always wins)
                         ├─▶ Baseline layer (JS, no Python)  ── z-scores, explanations, idle/fuel-waste
                         └─▶ ML sidecar (Python, HTTP) ── is_anomaly, scenario, confidence
                                     │ both feed
                                     ▼
                         anomaly.service ─▶ alert.service (source:'ML', max severity MEDIUM)
                                     │
                                     └─▶ Gemini: explains, answers "why?", recommends training
```

Design rules:

1. **Rules stay first.** ML findings are labelled `source: 'ML'`, capped at
   MEDIUM ("advisory"), never trigger a stop or the alarm and never block
   the checklist. This is the "deterministic rules before AI" USP made
   literal.
2. **Two ML tiers so the demo can't break.** The JS baseline layer needs no
   Python, and produces the same explanation format. The Python ensemble
   adds the scenario label and unknown-fault detection. If the sidecar is
   down, the dashboard shows the baseline results only.
3. **Gemini never decides.** It gets the structured finding and produces
   the explanation, the "why", and the training suggestion.

## 4. Implementation phases

### Phase 1 — Make the ML runnable and honest (½ day)
1. `pip install pandas numpy scikit-learn xgboost lightgbm joblib` (add
   `ml/requirements.txt`). Run `python anomaly_ensemble.py train`; commit the
   `evaluation_report.json`, not the joblib (gitignore it).
2. **Record a second dataset from the live simulator** (not the generator):
   with the scenarios running in `applyScenarioAfterTelemetry`, so it has
   ramps and noise. Train on the CSV, test on the live recording, and report
   *that*. This is the only accuracy figure worth showing.
3. Drop `idleRatio`, `fuelPerLoadCycle` from anything shown; add rolling
   fuel-per-cycle.
4. Add a hold-out test: train with one scenario removed and check it comes
   out as `UNKNOWN_ANOMALY`.

### Phase 2 — Baseline layer in Node (1 day)
New `services/baseline.service.js`, run on every telemetry message:
- `ml/export_baselines.py` writes `baselines.json` (median and spread per
  machine × state × sensor) from training.
- Per machine, compute robust z per sensor against the current state's
  baseline. Flag `|z| ≥ 3` sustained for 5 readings. Learn baselines online
  (EWMA) so live machines adapt.
- **Idle:** track idle minutes per shift vs the machine's and the fleet's
  historical average (from `shifts`). Output `{idleMin: 47, baselineMin: 18,
  ratio: 2.6, fuelWastedL: (47−18)/60 × 4.0}`.
- **Fuel:** rolling litres per load cycle vs baseline.
- **Explanation string built from real numbers**, in the alert's code +
  params form, so it's translated into EN/हिंदी/தமிழ் like the other alerts
  (e.g. `alert.title.IDLE_ANOMALY`, params `{idleMin, baselineMin, ratio, fuelL}`).

### Phase 3 — Python sidecar and wiring (1 day)
- `ml/serve.py`: stdlib `ThreadingHTTPServer` (no new deps), loads the
  bundle once, `POST /predict` → `StreamDetector.predict_one()` (guard with a
  lock; it holds per-machine state), `GET /health`.
- `services/anomalyDetection.service.js` (the empty file): subscribes to
  the bus `telemetry`, throttles per machine (every 4 s is fine, 3 machines),
  calls the sidecar with a 300 ms timeout and a circuit breaker (after 3
  failures, skip for 30 s and mark `ml: 'degraded'` in `/api/health`).
- Merge with baseline output. Emit `ml:finding` on the bus and Socket.IO,
  and raise it through `alert.service` with `source: 'ML'` (the existing
  dedupe, lifecycle and black-box replay then work unchanged). Only
  `confirmed` results become alerts.
- `npm run dev` gains an optional `npm run ml` (spawns the sidecar); if the
  Python env is missing the backend logs one line and carries on.

### Phase 4 — Show it (1 day)
- Dashboard: "Machine health" card on the operator's screen (advisory chip
  with the plain-language reason, e.g. "Engine 93 °C vs normal 78 °C for
  this work — not critical yet").
- Control Room: fleet table with per-machine anomaly chips and the
  idle/fuel comparison; add a small **fleet map** (Leaflet + OSM, no key)
  from `latitude`/`longitude`. The simulator's position is currently fixed,
  so add a small wander in `machine.js` for the demo.
- Gemini: new tool `getAnomalies(machineId)`; add to the system prompt that
  it must quote the numbers from the tool and never invent a cause.

### Phase 5 — Close the training loop (1–2 days)
- Extend `RULE_TO_MODULE` with ML findings: `IDLE_ANOMALY → SIM_IDLE_REDUCTION`,
  `FUEL_ANOMALY → SIM_FUEL_EFFICIENT`, `HIGH_VIBRATION → SIM_OVERHEAT`-style
  inspection module. Two new simulation modules are JSON only (see the
  README's "Adding a module").
- **Prove it worked:** store `alertRatePerOperatingHour` per rule per
  operator per shift; after a module is passed, show the next 7 days
  (or the next N shifts in the demo) vs the previous ones. That is the
  "Reassess → Measure improvement" step; nothing in the dataset can do this,
  it must come from live Firestore data.
- Persistent skill gap (same rule in ≥3 of the last 5 shifts) → create a
  `bookings` recommendation → instructor slot picker (static instructor list,
  Firestore `bookings`).

## 5. Beyond ML — gaps against your brief

| Brief item | Status | What to add |
|---|---|---|
| Seatbelt **compliance %** per shift | Not shown | Belted ticks ÷ working-state ticks. Pure arithmetic; put it in `buildSummary`. |
| Safety Score combining belt, proximity, idle, harsh operation | Only alert counts | `100 − 15·critical − 8·high − 3·medium` (exists) + belt compliance + proximity events + idle excess + ML advisories (small weights). Keep it explainable: show the deductions. |
| GPS machine↔machine / worker geofence | Distance sensor only | Haversine over fleet `latitude/longitude`; add `PROXIMITY_MACHINE` to the rule engine (rules, not ML). |
| Heat, slope, terrain, fatigue in thresholds | Rain, visibility, night, load, speed done | Multiply the envelope by fatigue hours; lower the overheating limit when ambient is high (`site.ambientTempC` already exists); use `terrain` and `tiltAngleDeg`. |
| One-tap / voice incident log | SOS only | "Log incident" button with categories; voice via the Web Speech API (already used for voice output), classified by Gemini; attach the last telemetry automatically (the incident service already captures a black-box). |
| Micro-videos + adaptive quiz | Not built | Video: short clips or narrated slides per module. Quiz: static reviewed question bank; optionally have Gemini rephrase or pick difficulty, but **never generate safety answers at runtime**. |
| Streaks, leaderboard | XP/levels/badges exist | Crew leaderboard from `operators`; "safe-shift streak" from shifts with no CRITICAL alerts. |

## 6. Risks and how to handle them

- **Overfitting to synthetic data** — report only the live-recording test
  (phase 1) and label the CSV result as a sanity check.
- **Alert fatigue** — ML advisories require `confirmed` and dedupe per
  machine and type; cap at one per type per 10 minutes.
- **Python on demo laptops** — the sidecar is optional; the JS baseline
  gives the same explanations.
- **Latency** — 3 machines × 1 reading per 4 s is trivial; the 300 ms timeout
  and breaker keep the telemetry path unaffected.
- **Trust** — every ML alert must show its numbers and the words "advisory";
  none may use the alarm.

## 7. Suggested order for the hackathon

1 → 2 → 3 gets the headline demo (explainable idle/fuel/overheating
advisory, with numbers). Then the safety-score and seatbelt-compliance
items in §5 (cheap, visible), then phase 4's Control Room panel, then
phase 5.
