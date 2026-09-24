from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ============================================================
# Paths
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "model"

TRAIN_PATH = DATA_DIR / "train.csv"
VALIDATION_PATH = DATA_DIR / "validation.csv"
TEST_PATH = DATA_DIR / "test.csv"

MODEL_PATH = MODEL_DIR / "eta_model.joblib"


# ============================================================
# Features
# ============================================================

NUMERIC_FEATURES = [
    "engineHours",
    "fuelLevelLitres",
    "fuelConsumptionRateLph",
    "loadCycles",
    "idleTime",
    "engineRpm",
    "engineTemperature",
    "hydraulicTemperature",
    "vibration",
]

CATEGORICAL_FEATURES = [
    "machineId",
    "state",
    "scenario",
    "seatbeltStatus",
]

TARGET = "eta_minutes"


# ============================================================
# Load data
# ============================================================

print("Loading ETA dataset...")

train_df = pd.read_csv(TRAIN_PATH)
validation_df = pd.read_csv(VALIDATION_PATH)
test_df = pd.read_csv(TEST_PATH)

print(f"Training samples:   {len(train_df)}")
print(f"Validation samples: {len(validation_df)}")
print(f"Test samples:       {len(test_df)}")


# ============================================================
# Split features and target
# ============================================================

X_train = train_df[
    NUMERIC_FEATURES + CATEGORICAL_FEATURES
]

y_train = train_df[TARGET]

X_validation = validation_df[
    NUMERIC_FEATURES + CATEGORICAL_FEATURES
]

y_validation = validation_df[TARGET]

X_test = test_df[
    NUMERIC_FEATURES + CATEGORICAL_FEATURES
]

y_test = test_df[TARGET]


# ============================================================
# Preprocessing
# ============================================================

preprocessor = ColumnTransformer(
    transformers=[
        (
            "numeric",
            "passthrough",
            NUMERIC_FEATURES,
        ),
        (
            "categorical",
            OneHotEncoder(
                handle_unknown="ignore",
                sparse_output=False,
            ),
            CATEGORICAL_FEATURES,
        ),
    ]
)


# ============================================================
# Model
# ============================================================

model = HistGradientBoostingRegressor(
    learning_rate=0.05,
    max_iter=400,
    max_leaf_nodes=31,
    min_samples_leaf=20,
    l2_regularization=0.5,
    random_state=42,
)


# ============================================================
# Pipeline
# ============================================================

pipeline = Pipeline(
    steps=[
        (
            "preprocessor",
            preprocessor,
        ),
        (
            "model",
            model,
        ),
    ]
)


# ============================================================
# Train
# ============================================================

print("\nTraining ETA model...")

pipeline.fit(
    X_train,
    y_train,
)

print("Training complete.")


# ============================================================
# Evaluation helper
# ============================================================

def evaluate(name, X, y):
    predictions = pipeline.predict(X)

    mae = mean_absolute_error(
        y,
        predictions,
    )

    rmse = np.sqrt(
        mean_squared_error(
            y,
            predictions,
        )
    )

    r2 = r2_score(
        y,
        predictions,
    )

    print(f"\n{name}")
    print("-" * 40)
    print(f"MAE:  {mae:.3f} minutes")
    print(f"RMSE: {rmse:.3f} minutes")
    print(f"R²:   {r2:.4f}")

    return {
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
    }


# ============================================================
# Evaluate
# ============================================================

validation_metrics = evaluate(
    "Validation Results",
    X_validation,
    y_validation,
)

test_metrics = evaluate(
    "Test Results",
    X_test,
    y_test,
)


# ============================================================
# Save model
# ============================================================

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

artifact = {
    "pipeline": pipeline,
    "numeric_features": NUMERIC_FEATURES,
    "categorical_features": CATEGORICAL_FEATURES,
    "target": TARGET,
    "validation_metrics": validation_metrics,
    "test_metrics": test_metrics,
}

joblib.dump(
    artifact,
    MODEL_PATH,
)

print(
    f"\nModel saved to:\n{MODEL_PATH}"
)