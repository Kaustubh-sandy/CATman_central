const config = require('../config/env');
const repo = require('../db/repo');
const bus = require('./bus');
const audit = require('./audit.service');
const siteService = require('./site.service');
const incidentService = require('./incident.service');
const { createSafetyEngine } = require('./safety.engine');
const { emit } = require('../socket/socket');

const OPEN_STATUSES = ['ALERTED', 'ESCALATED', 'ACKNOWLEDGED'];

const engine = createSafetyEngine();
const openByKey = new Map(); // `${machineId}:${ruleId}` -> alertId
const escalationTimers = new Map();
let getShiftForMachine = () => null;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const keyOf = (machineId, ruleId) => `${machineId}:${ruleId}`;

function save(alert, event = 'alert:updated') {
  const saved = repo.put('alerts', alert.id, alert);
  emit(event, saved);
  return saved;
}

function stamp(alert, status, by) {
  const at = new Date().toISOString();
  alert.status = status;
  alert.history = [...(alert.history || []), { status, by: by || 'SYSTEM', at }];
  alert[`${status.toLowerCase()}At`] = at;
  return alert;
}

function close(alert, by, reason) {
  stamp(alert, 'RESOLVED', by);
  alert.resolution = reason;
  openByKey.delete(keyOf(alert.machineId, alert.ruleId));
  clearTimeout(escalationTimers.get(alert.id));
  audit.log('ALERT_RESOLVED', { operatorId: alert.operatorId, machineId: alert.machineId, alertId: alert.id, ruleId: alert.ruleId, by, reason });
  return save(alert);
}

function scheduleEscalation(alert) {
  escalationTimers.set(
    alert.id,
    setTimeout(() => {
      const current = repo.get('alerts', alert.id);
      if (!current || current.status !== 'ALERTED') return;
      stamp(current, 'ESCALATED', 'SYSTEM');
      audit.log('ALERT_ESCALATED', { operatorId: current.operatorId, machineId: current.machineId, alertId: current.id, ruleId: current.ruleId });
      const saved = save(current);
      emit('supervisor:escalation', saved);
    }, config.alertEscalationMs)
  );
}

function raise(machineId, condition, shift) {
  const now = new Date().toISOString();
  const alert = {
    id: `ALR-${Date.now().toString(36).toUpperCase()}-${condition.ruleId.slice(0, 4)}`,
    machineId,
    operatorId: shift?.operatorId || null,
    shiftId: shift?.id || null,
    ruleId: condition.ruleId,
    code: condition.ruleId,
    severity: condition.severity,
    reason: condition.reason,
    evidence: condition.evidence,
    params: condition.params,
    detectedAt: now,
    conditionCleared: false,
    history: [{ status: 'DETECTED', by: 'SYSTEM', at: now }],
  };
  stamp(alert, 'ALERTED', 'SYSTEM');
  openByKey.set(keyOf(machineId, condition.ruleId), alert.id);

  if (alert.severity === 'CRITICAL') {
    alert.incidentId = incidentService.createFromAlert(alert).id;
    scheduleEscalation(alert);
  }

  audit.log('ALERT_RAISED', { operatorId: alert.operatorId, machineId, alertId: alert.id, ruleId: alert.ruleId, severity: alert.severity, reason: alert.reason, evidence: alert.evidence });
  return save(alert, 'alert:new');
}

function process(machineId, telemetry) {
  const shift = getShiftForMachine(machineId);
  const { conditions, envelope } = engine.evaluate(machineId, telemetry, { site: siteService.get(), shift });
  emit('safety:envelope', { machineId, envelope, distanceM: telemetry.nearestObjectDistanceM });

  const activeRules = new Set(conditions.map((c) => c.ruleId));

  conditions.forEach((c) => {
    const openId = openByKey.get(keyOf(machineId, c.ruleId));
    if (!openId) {
      raise(machineId, c, shift);
      return;
    }
    const current = repo.get('alerts', openId);
    if (current && current.conditionCleared) {
      current.conditionCleared = false;
      current.evidence = c.evidence;
      current.params = c.params;
      current.reason = c.reason;
      save(current);
    }
  });

  // Conditions that are no longer true.
  Array.from(openByKey.entries())
    .filter(([key]) => key.startsWith(`${machineId}:`))
    .forEach(([key, id]) => {
      const ruleId = key.split(':')[1];
      if (activeRules.has(ruleId)) return;
      const alert = repo.get('alerts', id);
      if (!alert) {
        openByKey.delete(key);
        return;
      }
      // CRITICAL alerts stay until a person acknowledges them; everything else auto-resolves.
      if (alert.severity !== 'CRITICAL' || alert.status === 'ACKNOWLEDGED') {
        close(alert, 'SYSTEM', 'CONDITION_CLEARED');
      } else if (!alert.conditionCleared) {
        alert.conditionCleared = true;
        save(alert);
      }
    });
}

function acknowledge(id, by) {
  const alert = repo.get('alerts', id);
  if (!alert) throw httpError(404, `Alert ${id} not found`);
  if (!['ALERTED', 'ESCALATED'].includes(alert.status)) throw httpError(409, `Alert is ${alert.status}`);
  clearTimeout(escalationTimers.get(id));
  stamp(alert, 'ACKNOWLEDGED', by);
  audit.log('ALERT_ACKNOWLEDGED', { operatorId: alert.operatorId, machineId: alert.machineId, alertId: id, ruleId: alert.ruleId, by });
  if (alert.conditionCleared) return close(alert, by, 'ACKNOWLEDGED_AFTER_CLEAR');
  return save(alert);
}

function resolve(id, by) {
  const alert = repo.get('alerts', id);
  if (!alert) throw httpError(404, `Alert ${id} not found`);
  if (!OPEN_STATUSES.includes(alert.status)) throw httpError(409, `Alert is ${alert.status}`);
  return close(alert, by, 'MANUAL');
}

function get(id) {
  const alert = repo.get('alerts', id);
  if (!alert) throw httpError(404, `Alert ${id} not found`);
  return alert;
}

function list({ status, machineId, operatorId, since, limit = 100 } = {}) {
  return repo
    .list(
      'alerts',
      (a) =>
        (!status || (status === 'open' ? OPEN_STATUSES.includes(a.status) : a.status === status)) &&
        (!machineId || a.machineId === machineId) &&
        (!operatorId || a.operatorId === operatorId) &&
        (!since || a.detectedAt >= since)
    )
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, limit);
}

function init({ shiftLookup }) {
  getShiftForMachine = shiftLookup;

  // Rebuild dedupe index after a restart so we don't raise duplicates.
  repo.list('alerts', (a) => OPEN_STATUSES.includes(a.status)).forEach((a) => openByKey.set(keyOf(a.machineId, a.ruleId), a.id));

  bus.on('telemetry', (machineId, telemetry) => process(machineId, telemetry));
}

module.exports = { init, acknowledge, resolve, get, list, OPEN_STATUSES };
