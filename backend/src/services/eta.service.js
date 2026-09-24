// Task ETA from the Python model (ml/eta/predict.py). The model is the only source
// of the ETA and its explanation: this service just runs it with the latest
// telemetry and passes its JSON through unchanged.
//
// Each run starts a Python process and loads the model (a few seconds), so it only
// runs for machines with an ACTIVE task, one process per machine at a time, at most
// once per ETA_INTERVAL_MS. Failures are recorded and never reach the telemetry pipeline.

const path = require('path');
const { execFile } = require('child_process');
const config = require('../config/env');
const repo = require('../db/repo');
const bus = require('./bus');
const { emit } = require('../socket/socket');

const SCRIPT = path.join(__dirname, '..', 'ml', 'eta', 'predict.py');
const MAX_OUTPUT_BYTES = 1024 * 1024;

const latest = new Map(); // machineId -> last result (or error) for the active task
const running = new Set();
const lastRunAt = new Map();
const loggedErrors = new Set();

const status = {
  enabled: config.eta.enabled,
  python: config.eta.python,
  script: SCRIPT,
  unavailable: null,
  runs: 0,
  failures: 0,
  lastSuccessAt: null,
  lastError: null,
};

function logOnce(message) {
  if (loggedErrors.has(message)) return;
  loggedErrors.add(message);
  console.error(`[ETA] ${message}`);
}

// predict.py prints one JSON line on stdout (sklearn warnings go to stderr).
function parseOutput(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function runPredictor(telemetry) {
  return new Promise((resolve, reject) => {
    execFile(
      config.eta.python,
      [SCRIPT, JSON.stringify(telemetry)],
      { timeout: config.eta.timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
      (err, stdout, stderr) => {
        const out = parseOutput(stdout);
        if (out?.error) return reject(new Error(`predict.py: ${out.error}`));
        if (err) {
          const e = new Error(
            err.code === 'ENOENT'
              ? `Python not found ("${config.eta.python}"). Set ETA_PYTHON in backend/.env`
              : err.killed
                ? `predict.py timed out after ${config.eta.timeoutMs} ms`
                : `predict.py failed: ${String(stderr || err.message).trim().split(/\r?\n/).pop()}`
          );
          e.code = err.code;
          return reject(e);
        }
        if (!out || typeof out.eta_minutes !== 'number') return reject(new Error('predict.py returned no eta_minutes'));
        return resolve(out);
      }
    );
  });
}

function activeTaskOn(machineId) {
  return repo.list('tasks', (t) => t.machineId === machineId && t.status === 'ACTIVE')[0] || null;
}

async function predict(machineId, taskId, telemetry) {
  running.add(machineId);
  lastRunAt.set(machineId, Date.now());
  const started = Date.now();
  status.runs += 1;

  try {
    const prediction = await runPredictor(telemetry);
    const result = {
      ...prediction,
      machineId,
      taskId,
      telemetryAt: telemetry.timestamp || null,
      predictedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      source: 'ml/eta/predict.py',
    };
    latest.set(machineId, result);
    status.lastSuccessAt = result.predictedAt;
    emit('eta:updated', result);
  } catch (err) {
    status.failures += 1;
    status.lastError = { message: err.message, at: new Date().toISOString() };
    if (err.code === 'ENOENT') status.unavailable = err.message;
    logOnce(err.message);

    // Keep the last good prediction for this task, flagged with the error.
    const previous = latest.get(machineId);
    const result = {
      ...(previous?.taskId === taskId ? previous : { machineId, taskId }),
      error: err.message,
      errorAt: status.lastError.at,
    };
    latest.set(machineId, result);
    emit('eta:updated', result);
  } finally {
    running.delete(machineId);
  }
}

function onTelemetry(machineId, telemetry) {
  if (!status.enabled || status.unavailable || running.has(machineId)) return;
  const task = activeTaskOn(machineId);
  if (!task) return;

  // A new task gets its first prediction straight away.
  const sameTask = latest.get(machineId)?.taskId === task.id;
  if (sameTask && Date.now() - (lastRunAt.get(machineId) || 0) < config.eta.intervalMs) return;

  predict(machineId, task.id, telemetry).catch((err) => logOnce(err.message));
}

function get(machineId) {
  return latest.get(machineId) || null;
}

function getStatus() {
  return { ...status, running: Array.from(running) };
}

function init() {
  if (!status.enabled) {
    console.log('[ETA] Disabled (ETA_ENABLED=false)');
    return;
  }
  bus.on('telemetry', (machineId, telemetry) => {
    try {
      onTelemetry(machineId, telemetry);
    } catch (err) {
      logOnce(err.message);
    }
  });
  console.log(`[ETA] Python model: ${config.eta.python} ${path.relative(process.cwd(), SCRIPT)} (every ${config.eta.intervalMs / 1000} s per active task)`);
}

module.exports = { init, get, getStatus };
