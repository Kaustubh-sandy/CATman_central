// ML anomaly detection (ml/anomaly_ensemble.py) — advisory only.
//
// Starts ml/anomaly_server.py (the trained ensemble behind a small local HTTP server,
// reused if one is already running), sends it each telemetry reading with only the
// fields the model was trained on, and pushes the result to the dashboard.
// It never raises or silences a safety alert: those come only from the rule engine.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config/env');
const bus = require('./bus');
const audit = require('./audit.service');
const { emit } = require('../socket/socket');

const ML_DIR = path.join(__dirname, '..', 'ml');
const SERVER_SCRIPT = path.join(ML_DIR, 'anomaly_server.py');
const MODEL_FILE = path.join(ML_DIR, 'models', 'ensemble.joblib');
const FIELDS = ['machineId', 'timestamp', 'state', 'idleTime', 'engineRpm', 'fuelConsumptionRateLph', 'engineTemperature', 'hydraulicTemperature', 'vibration'];
const STARTUP_TIMEOUT_MS = 90000;
const REQUEST_TIMEOUT_MS = 3000;
const RESTART_AFTER_MS = 30000;
// The model's rolling features cover 15 readings (60 s); before that its output is unreliable.
const WARMUP_READINGS = 15;
const STRONG_PROBABILITY = 0.5;

const baseUrl = () => `http://127.0.0.1:${config.anomaly.port}`;
const latest = new Map(); // machineId -> last result
const inFlight = new Set();
const readings = new Map(); // machineId -> readings scored
let child = null;
let lastStartAt = 0;
const status = { enabled: config.anomaly.enabled, state: 'OFF', model: MODEL_FILE, evaluation: null, predictions: 0, failures: 0, lastError: null };

async function request(pathname, body, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const health = await request('/health', null, 1500);
      status.state = 'READY';
      status.evaluation = health.evaluation;
      console.log(`[Anomaly] ML model ready on ${baseUrl()}${health.evaluation ? ` (held-out F1 ${health.evaluation.f1})` : ''}`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  status.state = 'FAILED';
  status.lastError = 'model server did not start in time';
  console.error(`[Anomaly] ${status.lastError}`);
  return false;
}

async function start() {
  lastStartAt = Date.now();
  // Reuse a server left running by a previous backend process (e.g. a nodemon restart).
  try {
    await request('/health', null, 1500);
    return waitUntilReady();
  } catch {
    /* not running — start it */
  }

  status.state = 'STARTING';
  child = spawn(config.eta.python, [SERVER_SCRIPT, '--port', String(config.anomaly.port)], { cwd: ML_DIR, windowsHide: true });
  child.stderr.on('data', () => {}); // sklearn version warnings
  child.on('error', (err) => {
    status.state = 'FAILED';
    status.lastError = err.code === 'ENOENT' ? `Python not found ("${config.eta.python}")` : err.message;
    console.error(`[Anomaly] ${status.lastError}`);
  });
  child.on('exit', (code) => {
    child = null;
    if (status.state !== 'FAILED') status.state = 'STOPPED';
    if (code) console.error(`[Anomaly] model server exited with code ${code}`);
  });
  return waitUntilReady();
}

// How to show a result (the model's own output is kept unchanged alongside):
//   WARMING  — fewer than 15 readings for this machine yet
//   ANOMALY  — confirmed (3 of last 5) as a recognised fault, or with probability ≥ 50 %
//   WATCH    — confirmed but weak or unrecognised (e.g. an engine still cooling after a fault)
//   NORMAL   — including single-reading flags that were not confirmed
function levelOf(result, count) {
  if (count < WARMUP_READINGS) return 'WARMING';
  const known = result.scenario && !['NORMAL', 'UNKNOWN_ANOMALY'].includes(result.scenario);
  if (result.confirmed && (known || result.anomaly_probability >= STRONG_PROBABILITY)) return 'ANOMALY';
  if (result.confirmed) return 'WATCH';
  return 'NORMAL';
}

function onTransition(machineId, previous, result) {
  const was = previous?.level === 'ANOMALY' ? previous.scenario : 'NORMAL';
  const now = result.level === 'ANOMALY' ? result.scenario : 'NORMAL';
  if (was === now) return;
  audit.log(now === 'NORMAL' ? 'ML_ANOMALY_CLEARED' : 'ML_ANOMALY_DETECTED', {
    machineId,
    scenario: now === 'NORMAL' ? was : now,
    probability: result.anomaly_probability,
    reasons: result.reasons,
  });
}

async function score(machineId, telemetry) {
  const reading = {};
  for (const f of FIELDS) {
    if (telemetry[f] === undefined || telemetry[f] === null) return; // incomplete reading: skip
    reading[f] = telemetry[f];
  }
  inFlight.add(machineId);
  try {
    const result = await request('/predict', reading);
    const previous = latest.get(machineId);
    const count = (readings.get(machineId) || 0) + 1;
    readings.set(machineId, count);
    const entry = { ...result, level: levelOf(result, count), machineId, telemetryAt: telemetry.timestamp, updatedAt: new Date().toISOString(), advisory: true };
    latest.set(machineId, entry);
    status.predictions += 1;
    onTransition(machineId, previous, entry);
    emit('anomaly:updated', entry);
  } catch (err) {
    status.failures += 1;
    status.lastError = err.message;
    if (/ECONNREFUSED|fetch failed/i.test(err.message) || err.cause?.code === 'ECONNREFUSED') {
      status.state = 'STOPPED';
    }
  } finally {
    inFlight.delete(machineId);
  }
}

function onTelemetry(machineId, telemetry) {
  if (status.state === 'STOPPED' && Date.now() - lastStartAt > RESTART_AFTER_MS) {
    start().catch(() => {});
    return;
  }
  if (status.state !== 'READY' || inFlight.has(machineId)) return;
  score(machineId, telemetry).catch(() => {});
}

function init() {
  if (!status.enabled) {
    console.log('[Anomaly] Disabled (ANOMALY_ENABLED=false)');
    return;
  }
  if (!fs.existsSync(MODEL_FILE)) {
    status.state = 'NO_MODEL';
    console.warn('[Anomaly] No trained model — run: cd src/ml && python anomaly_ensemble.py train --data ../../../../anomaly_detection_dataset.csv --out-dir models');
    return;
  }
  bus.on('telemetry', (machineId, t) => {
    try {
      onTelemetry(machineId, t);
    } catch (err) {
      status.lastError = err.message;
    }
  });
  start().catch((err) => {
    status.state = 'FAILED';
    status.lastError = err.message;
  });
  process.on('exit', () => child && child.kill());
}

function get(machineId) {
  return latest.get(machineId) || null;
}

function getStatus() {
  return { ...status, port: config.anomaly.port, machines: latest.size };
}

module.exports = { init, get, getStatus, FIELDS };
