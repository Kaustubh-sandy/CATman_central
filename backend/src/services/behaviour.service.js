// Operator safety behaviour for the current shift, from live telemetry and alerts:
// seatbelt compliance (share of working time with the belt fastened), alerts by
// severity and rule, and a live safety score. The end-of-shift summary uses the
// same numbers, so what the operator sees during the shift is what gets recorded.

const repo = require('../db/repo');
const bus = require('./bus');
const { emit } = require('../socket/socket');

const WORKING_STATES = new Set(['OPERATING', 'LOADING', 'UNLOADING', 'TRANSPORTING']);
const MAX_GAP_SEC = 10; // a longer gap between messages is not counted (machine offline)
const PUSH_EVERY_MS = 5000;
const PERSIST_EVERY_MS = 30000;

// Safety score = 100 − 15·critical − 8·high − 3·medium − 0.3·(100 − seatbelt compliance %)
const PENALTY = { CRITICAL: 15, HIGH: 8, MEDIUM: 3 };
const BELT_PENALTY_PER_PCT = 0.3;

const counters = new Map(); // shiftId -> { workingSec, beltedSec, lastAtMs, lastPushMs, lastPersistMs }
let getShiftForMachine = () => null;

function countersFor(shift) {
  if (!counters.has(shift.id)) {
    const saved = shift.behaviour || {};
    counters.set(shift.id, {
      workingSec: saved.workingSec || 0,
      beltedSec: saved.beltedSec || 0,
      lastAtMs: null,
      lastPushMs: 0,
      lastPersistMs: Date.now(),
    });
  }
  return counters.get(shift.id);
}

function compute(shift) {
  if (!shift) return null;
  const c = countersFor(shift);
  const since = shift.startedAt || shift.createdAt;
  const alerts = repo.list('alerts', (a) => a.shiftId === shift.id && a.detectedAt >= since);

  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  const byRule = {};
  alerts.forEach((a) => {
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    byRule[a.ruleId] = (byRule[a.ruleId] || 0) + 1;
  });

  const seatbeltCompliancePct = c.workingSec >= 1 ? Math.round((c.beltedSec / c.workingSec) * 1000) / 10 : null;
  const alertPenalty = Object.entries(PENALTY).reduce((sum, [sev, p]) => sum + p * bySeverity[sev], 0);
  const beltPenalty = seatbeltCompliancePct === null ? 0 : Math.round(BELT_PENALTY_PER_PCT * (100 - seatbeltCompliancePct));
  const openAlerts = alerts.filter((a) => a.status !== 'RESOLVED').length;

  return {
    shiftId: shift.id,
    operatorId: shift.operatorId,
    machineId: shift.machineId,
    since,
    workingMin: Number((c.workingSec / 60).toFixed(1)),
    unbeltedWorkingSec: Math.round(c.workingSec - c.beltedSec),
    seatbeltCompliancePct,
    alerts: { total: alerts.length, open: openAlerts, critical: bySeverity.CRITICAL, high: bySeverity.HIGH, medium: bySeverity.MEDIUM },
    byRule,
    penalties: { alerts: alertPenalty, seatbelt: beltPenalty },
    safetyScore: Math.max(0, 100 - alertPenalty - beltPenalty),
    workingSec: Math.round(c.workingSec),
    beltedSec: Math.round(c.beltedSec),
    updatedAt: new Date().toISOString(),
  };
}

function push(shift) {
  const b = compute(shift);
  const c = countersFor(shift);
  c.lastPushMs = Date.now();
  emit('behaviour:updated', b);

  if (Date.now() - c.lastPersistMs >= PERSIST_EVERY_MS) {
    c.lastPersistMs = Date.now();
    persist(shift.id, b);
  }
  return b;
}

// Only the counters are stored on the shift; everything else is derived.
function persist(shiftId, b) {
  if (!repo.get('shifts', shiftId)) return;
  repo.patch('shifts', shiftId, { behaviour: { workingSec: b.workingSec, beltedSec: b.beltedSec, safetyScore: b.safetyScore, seatbeltCompliancePct: b.seatbeltCompliancePct } });
}

function tracking(shift) {
  return shift && shift.startedAt && !shift.endedAt;
}

function onTelemetry(machineId, t) {
  const shift = getShiftForMachine(machineId);
  if (!tracking(shift)) return;

  const c = countersFor(shift);
  const now = Date.now();
  const dt = c.lastAtMs === null ? 0 : (now - c.lastAtMs) / 1000;
  c.lastAtMs = now;

  if (dt > 0 && dt <= MAX_GAP_SEC && WORKING_STATES.has(t.state)) {
    c.workingSec += dt;
    if (t.seatbeltStatus === true) c.beltedSec += dt;
  }

  if (now - c.lastPushMs >= PUSH_EVERY_MS) push(shift);
}

function onAlert(alert) {
  if (!alert.shiftId) return;
  const shift = repo.get('shifts', alert.shiftId);
  if (tracking(shift)) push(shift);
}

// Called when the shift ends: store the final counters with the shift.
function finalize(shift) {
  const b = compute(shift);
  counters.delete(shift.id);
  return b;
}

function init({ shiftLookup }) {
  getShiftForMachine = shiftLookup;
  bus.on('telemetry', (machineId, t) => {
    try {
      onTelemetry(machineId, t);
    } catch (err) {
      console.error('[Behaviour]', err.message);
    }
  });
  bus.on('alert:raised', onAlert);
}

module.exports = { init, compute, finalize, PENALTY, BELT_PENALTY_PER_PCT };
