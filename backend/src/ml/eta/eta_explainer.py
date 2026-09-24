import shap


class ETAExplainer:
    def __init__(self, pipeline, background_data):
        self.pipeline = pipeline

        self.preprocessor = pipeline.named_steps[
            "preprocessor"
        ]

        self.model = pipeline.named_steps[
            "model"
        ]

        self.background = (
            self.preprocessor.transform(
                background_data
            )
        )

        self.explainer = shap.Explainer(
            self.model.predict,
            self.background,
            algorithm="permutation"
        )

    def explain(self, dataframe):
        transformed = (
            self.preprocessor.transform(
                dataframe
            )
        )

        shap_values = self.explainer(
            transformed
        )

        values = shap_values.values[0]

        feature_names = (
            self.preprocessor
            .get_feature_names_out()
        )

        # Map transformed features back to
        # meaningful original feature names.
        feature_groups = {}

        for name, value in zip(
            feature_names,
            values
        ):
            clean_name = (
                name
                .replace("numeric__", "")
                .replace("categorical__", "")
            )

            # Numeric features
            if clean_name in {
                "engineHours",
                "fuelLevelLitres",
                "fuelConsumptionRateLph",
                "loadCycles",
                "idleTime",
                "engineRpm",
                "engineTemperature",
                "hydraulicTemperature",
                "vibration",
            }:
                group = clean_name

            # Categorical features
            elif clean_name.startswith("state_"):
                group = "state"

            elif clean_name.startswith("scenario_"):
                group = "scenario"

            elif clean_name.startswith("machineId_"):
                group = "machineId"

            elif clean_name.startswith(
                "seatbeltStatus_"
            ):
                group = "seatbeltStatus"

            else:
                group = clean_name

            feature_groups[group] = (
                feature_groups.get(group, 0)
                + float(value)
            )

        name_map = {
            "engineHours": "Engine hours",
            "fuelLevelLitres": "Fuel level",
            "fuelConsumptionRateLph": (
                "Fuel consumption"
            ),
            "loadCycles": "Load cycles",
            "idleTime": "Idle time",
            "engineRpm": "Engine RPM",
            "engineTemperature": (
                "Engine temperature"
            ),
            "hydraulicTemperature": (
                "Hydraulic temperature"
            ),
            "vibration": "Vibration",
            "state": "Machine state",
            "scenario": "Operating scenario",
            "machineId": "Machine",
            "seatbeltStatus": "Seatbelt status",
        }

        explanation = []

        for feature, value in feature_groups.items():
            if abs(value) < 0.10:
                continue

            explanation.append({
                "factor": name_map.get(
                    feature,
                    feature
                ),
                "impact_minutes": round(
                    value,
                    2
                ),
                "direction": (
                    "increase"
                    if value > 0
                    else "decrease"
                )
            })

        explanation.sort(
            key=lambda x: abs(
                x["impact_minutes"]
            ),
            reverse=True
        )

        return explanation[:5]