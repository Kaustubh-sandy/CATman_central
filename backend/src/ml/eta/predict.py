import json
import sys
from pathlib import Path

import joblib
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIR
    / "model"
    / "eta_model.joblib"
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

    return round(
        float(prediction),
        2,
    )


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

        eta = predict_eta(
            payload
        )

        print(
            json.dumps(
                {
                    "eta_minutes": eta
                }
            )
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