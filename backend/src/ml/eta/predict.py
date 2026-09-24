import json
import sys
from pathlib import Path

import joblib
import pandas as pd

from eta_explainer import ETAExplainer


BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIR
    / "model"
    / "eta_model.joblib"
)

TRAIN_DATA_PATH = (
    BASE_DIR
    / "data"
    / "train.csv"
)


def load_model():
    artifact = joblib.load(
        MODEL_PATH
    )

    return artifact["pipeline"]


def predict_eta(payload):
    pipeline = load_model()

    dataframe = pd.DataFrame(
        [payload]
    )

    prediction = pipeline.predict(
        dataframe
    )[0]

    train_data = pd.read_csv(
        TRAIN_DATA_PATH
    )

    # Remove target column
    target_column = "eta_minutes"

    if target_column in train_data.columns:
        train_data = train_data.drop(
            columns=[target_column]
        )

    # Use a small background sample
    background_data = train_data.sample(
        n=min(50, len(train_data)),
        random_state=42
    )

    explainer = ETAExplainer(
        pipeline,
        background_data
    )

    explanation = explainer.explain(
        dataframe
    )

    return {
        "eta_minutes": round(
            float(prediction),
            2
        ),
        "explanation": explanation
    }


def main():
    if len(sys.argv) != 2:
        print(
            json.dumps(
                {
                    "error": (
                        "Expected telemetry "
                        "JSON as argument"
                    )
                }
            )
        )

        sys.exit(1)

    try:
        payload = json.loads(
            sys.argv[1]
        )

        result = predict_eta(
            payload
        )

        print(
            json.dumps(result)
        )

    except Exception as error:
        print(
            json.dumps(
                {
                    "error": str(error)
                }
            )
        )

        sys.exit(1)


if __name__ == "__main__":
    main()