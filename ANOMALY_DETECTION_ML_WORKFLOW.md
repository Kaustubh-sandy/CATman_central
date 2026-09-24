# Anomaly Detection & ML — CAT Smart Operator Assistant

## Overview

The anomaly-detection module is one part of the CAT Smart Operator Assistant. Its purpose is to continuously analyze excavator telemetry and identify abnormal machine behavior, classify known anomaly types, and provide an anomaly confidence that can be consumed by the wider monitoring/alerting system.

The ML layer handles:

- `NORMAL`
- `OVERHEATING`
- `HIGH_VIBRATION`
- `ABNORMAL_FUEL_CONSUMPTION`
- `EXCESSIVE_IDLE`

Safety/event conditions such as `SEATBELT_VIOLATION`, `PROXIMITY_HAZARD`, and `MACHINE_OFFLINE` are handled separately through the rule/event layer.

---

## 1. Telemetry Used

The model primarily uses these machine signals:

| Feature | Purpose |
|---|---|
| `engineRpm` | Engine operating behavior and abnormal idle RPM |
| `fuelConsumptionRateLph` | Detect abnormal fuel usage |
| `engineTemperature` | Detect overheating |
| `hydraulicTemperature` | Additional thermal signal |
| `vibration` | Detect excessive vibration |
| `state` | Provides operating context: IDLE, OPERATING, LOADING, etc. |
| `idleTime` | Used to detect persistent/excessive idle behavior |

The dataset contains **12,600 telemetry records from 3 excavators**:

```text
NORMAL                       9,000
OVERHEATING                    900
HIGH_VIBRATION                 900
ABNORMAL_FUEL_CONSUMPTION      900
EXCESSIVE_IDLE                 900
```

---

## 2. Feature Engineering

Raw telemetry is converted into features before reaching the models.

### State-aware features

The machine state is one-hot encoded:

```text
state_IDLE
state_STARTING
state_OPERATING
state_LOADING
state_UNLOADING
state_TRANSPORTING
```

This lets the model interpret sensor values according to the machine's current operating condition.

### Normalized sensor deviation

For each sensor, a state-dependent z-score is calculated:

```text
z = (current value - normal median) / normal spread
```

This measures how abnormal a reading is relative to normal behavior for that state.

### Ratios

```text
fuel_ratio = current fuel rate / normal fuel rate
vib_ratio  = current vibration / normal vibration
```

### Idle behavior

```text
idle_rate_per_min
idle_streak_s
idle_rpm_excess
```

These capture how quickly idle time is increasing, how long the machine has remained idle, and whether RPM is unusually high while idling.

### Temporal features

A 15-reading rolling window is used. With telemetry arriving every 4 seconds, this represents approximately **60 seconds of machine history**.

Features include:

```text
rolling temperature deviation
rolling hydraulic-temperature deviation
rolling mean/max vibration
rolling vibration variability
rolling fuel ratio
engine temperature trend
```

This allows the model to detect sustained abnormal behavior rather than relying only on a single reading.

---

## 3. ML Architecture

The model uses two complementary layers.

```text
                    TELEMETRY
                        |
                        v
               FEATURE ENGINEERING
                        |
          +-------------+-------------+
          |                           |
          v                           v
   UNSUPERVISED LAYER          SUPERVISED LAYER
          |                           |
    +-----+-----+               +-----+-----+
    |     |     |               |     |     |
   IF    LOF    AE             XGB   LGBM    RF
    |     |     |               |     |     |
    +-----+-----+               +-----+-----+
          |                           |
       anomaly                    scenario
        scores                    probabilities
          |                           |
          +-------------+-------------+
                        |
                        v
               LOGISTIC REGRESSION
                 META-LEARNER
                   STACKING
                        |
                        v
              FINAL ANOMALY SCORE
                        |
                        v
               SCENARIO DECISION
                        |
                        v
                 K-OF-N FILTER
                        |
                        v
                  ALERT / API
```

---

## 4. Unsupervised Models — "Does this look abnormal?"

The unsupervised models are trained primarily on **NORMAL** telemetry.

### Isolation Forest

Detects observations that can be easily isolated from the normal data distribution.

**Use:** catches globally unusual machine behavior, including potentially unseen fault patterns.

### Local Outlier Factor (LOF)

Compares the local density around a reading with its neighboring normal readings.

**Use:** detects readings that are unusual compared with similar operating conditions.

### Autoencoder

Learns to reconstruct normal telemetry.

```text
Input → Encoder → Latent representation → Decoder → Reconstruction
```

A large reconstruction error indicates that the telemetry does not resemble learned normal behavior.

**Use:** detects complex combinations of abnormal sensor behavior.

---

## 5. Supervised Models — "Which known anomaly is it?"

The supervised layer is trained using the labeled scenarios.

### XGBoost

Learns nonlinear relationships between telemetry features and known anomaly classes.

### LightGBM

Provides another gradient-boosted tree model with a different learning implementation.

### Random Forest

Provides a different tree-ensemble perspective using many randomized decision trees.

The three classifiers produce scenario probabilities, which are combined through soft voting.

---

## 6. Stacking / Meta-Learner

The outputs of the six base models are combined by a **Logistic Regression meta-learner**.

It receives:

```text
Isolation Forest anomaly score
LOF anomaly score
Autoencoder anomaly score
+
supervised classifier anomaly probability
```

The meta-learner learns how much each signal should contribute to the final anomaly probability.

Machine-level out-of-fold predictions are used for stacking so that the meta-model is trained on predictions from models that did not train on the corresponding machine.

---

## 7. Final Decision

The system combines the stacked anomaly probability with agreement among the unsupervised detectors.

For streaming inference, a **3-of-5 confirmation rule** is used:

```text
Last 5 readings
      |
3+ anomalous readings
      |
Confirmed anomaly
```

This reduces alerts caused by isolated noisy readings.

The model can also return `UNKNOWN_ANOMALY` when a reading is considered anomalous but does not have sufficient confidence for a known scenario. The current dataset does not contain a dedicated unknown-fault test set, so this pathway still requires separate validation.

---

## 8. Scenario Mapping

The telemetry changes simulated in the dataset align with the main ML scenarios:

```text
OVERHEATING
    → engine + hydraulic temperatures increase

HIGH_VIBRATION
    → vibration increases

ABNORMAL_FUEL_CONSUMPTION
    → fuel rate increases

EXCESSIVE_IDLE
    → machine remains in IDLE
    → RPM remains elevated
    → idle time increases
```

This makes the feature-engineering and model architecture directly connected to the simulated machine behavior.

---

## 9. Current Evaluation

The model was evaluated using a machine-level holdout:

```text
Training → EXC001 + EXC002
Testing  → EXC003
```

Current results on the simulated dataset:

| Model | ROC-AUC | F1 |
|---|---:|---:|
| Isolation Forest | 0.9290 | 0.6600 |
| LOF | 0.9664 | 0.3543 |
| Autoencoder | 0.9994 | 0.9872 |
| XGBoost | 1.0000 | 1.0000 |
| LightGBM | 1.0000 | 1.0000 |
| Random Forest | 1.0000 | 1.0000 |
| **Ensemble** | **1.0000** | **0.9975** |

Ensemble:

```text
Precision = 0.995
Recall    = 1.000
F1        = 0.9975
ROC-AUC   = 1.000
```

These results are for the current simulated dataset and should not be interpreted as real-world excavator performance.

---

## 10. Deployment Flow

The trained model is saved as:

```text
models/ensemble.joblib
```

The intended runtime flow is:

```text
Machine Simulator
       |
       v
    MQTT
       |
       v
Telemetry Subscriber
       |
       v
Feature Engineering
       |
       v
Anomaly Ensemble
       |
       v
Scenario + Confidence
       |
       v
FastAPI / WebSocket
       |
       v
Operator Dashboard
```

The anomaly-detection module therefore acts as the **ML intelligence layer** inside the larger CAT Smart Operator Assistant, while the rule layer handles deterministic safety and connectivity events.
