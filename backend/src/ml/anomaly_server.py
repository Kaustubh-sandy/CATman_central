"""
Anomaly model server for the Node backend (anomalyDetection.service.js).

Loads models/ensemble.joblib once through anomaly_ensemble.StreamDetector and scores
one telemetry reading per request. StreamDetector keeps each machine's recent history
(rolling features, 3-of-5 confirmation), so this runs as a long-lived process rather
than one process per reading.

    python anomaly_server.py --port 8765
    GET  /health   -> {"ok": true, ...}
    POST /predict  -> StreamDetector.predict_one(reading)

Only the fields the model was trained on are passed to it.
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import anomaly_ensemble as ae  # noqa: E402

MODEL_PATH = HERE / "models" / "ensemble.joblib"
REPORT_PATH = HERE / "models" / "evaluation_report.json"
FIELDS = ["machineId", "timestamp", "state", "idleTime"] + ae.SENSORS

lock = threading.Lock()
detector = ae.StreamDetector(str(MODEL_PATH))
stats = {"predictions": 0}


def evaluation_summary():
    try:
        report = json.loads(REPORT_PATH.read_text())
        ens = report["binary"]["ENSEMBLE"]
        return {k: round(float(v), 4) for k, v in ens.items()}
    except Exception:  # report is optional
        return None


EVALUATION = evaluation_summary()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "model": str(MODEL_PATH.name), "fields": FIELDS,
                             "scenarios": ae.ML_SCENARIOS + [ae.UNKNOWN], "evaluation": EVALUATION, **stats})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/predict":
            self._send(404, {"error": "not found"})
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            missing = [f for f in FIELDS if body.get(f) is None]
            if missing:
                self._send(400, {"error": f"missing fields: {', '.join(missing)}"})
                return
            reading = {f: body[f] for f in FIELDS}
            with lock:  # StreamDetector keeps per-machine state
                result = detector.predict_one(reading)
                stats["predictions"] += 1
            self._send(200, result)
        except Exception as error:  # never crash the server on one bad reading
            self._send(500, {"error": str(error)})

    def log_message(self, *args):  # keep the backend console clean
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    port = parser.parse_args().port
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(json.dumps({"ready": True, "port": port}), flush=True)
    server.serve_forever()
