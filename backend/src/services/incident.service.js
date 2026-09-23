const config = require('../config/env');
const repo = require('../db/repo');
const telemetryStore = require('./telemetryStore.service');
const audit = require('./audit.service');
const { emit } = require('../socket/socket');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function telemetryBetween(machineId, fromMs, toMs) {
  return telemetryStore
    .getHistory(machineId)
    .filter((t) => {
      const ts = Date.parse(t.timestamp);
      return ts >= fromMs && ts <= toMs;
    });
}

function save(incident, event = 'incident:updated') {
  const saved = repo.put('incidents', incident.id, incident);
  emit(event, saved);
  return saved;
}

// Black box: 60 s of telemetry before the event now, 60 s after it once available.
function withBlackBox(incident) {
  const at = Date.parse(incident.createdAt);
  const windowMs = config.blackBoxWindowMs;
  incident.blackBox = {
    windowSec: windowMs / 1000,
    eventAt: incident.createdAt,
    before: telemetryBetween(incident.machineId, at - windowMs, at),
    after: [],
    complete: false,
  };

  setTimeout(() => {
    const current = repo.get('incidents', incident.id);
    if (!current) return;
    current.blackBox = {
      ...current.blackBox,
      after: telemetryBetween(incident.machineId, at + 1, at + windowMs),
      complete: true,
    };
    save(current);
  }, windowMs);

  return incident;
}

function locationOf(machineId) {
  return telemetryStore.getLatest(machineId)?.location || null;
}

function createFromAlert(alert) {
  const incident = withBlackBox({
    id: `INC-${Date.now().toString(36).toUpperCase()}`,
    type: 'SAFETY_ALERT',
    alertId: alert.id,
    ruleId: alert.ruleId,
    severity: alert.severity,
    machineId: alert.machineId,
    operatorId: alert.operatorId,
    location: locationOf(alert.machineId),
    reason: alert.reason,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  });
  audit.log('INCIDENT_CREATED', { operatorId: alert.operatorId, machineId: alert.machineId, incidentId: incident.id, ruleId: alert.ruleId });
  return save(incident, 'incident:new');
}

function createSos({ operatorId, machineId, note }) {
  const open = repo.list('incidents', (i) => i.type === 'SOS' && i.operatorId === operatorId && ['OPEN', 'ACKNOWLEDGED'].includes(i.status));
  if (open.length) return open[0];

  const incident = withBlackBox({
    id: `SOS-${Date.now().toString(36).toUpperCase()}`,
    type: 'SOS',
    severity: 'CRITICAL',
    machineId,
    operatorId,
    location: locationOf(machineId),
    note: note || null,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  });
  audit.log('SOS_RAISED', { operatorId, machineId, incidentId: incident.id, location: incident.location });
  const saved = save(incident, 'incident:new');
  emit('sos:new', saved);
  return saved;
}

function createMaintenanceTicket({ shift, failedSensors }) {
  const incident = {
    id: `MNT-${Date.now().toString(36).toUpperCase()}`,
    type: 'MAINTENANCE',
    severity: 'HIGH',
    machineId: shift.machineId,
    operatorId: shift.operatorId,
    shiftId: shift.id,
    failedSensors: failedSensors.map((s) => ({ sensor: s.sensor, status: s.status, message: s.message || null })),
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  audit.log('MAINTENANCE_TICKET_CREATED', { operatorId: shift.operatorId, machineId: shift.machineId, incidentId: incident.id });
  return save(incident, 'incident:new');
}

function transition(id, allowedFrom, status, by, extra = {}) {
  const incident = repo.get('incidents', id);
  if (!incident) throw httpError(404, `Incident ${id} not found`);
  if (!allowedFrom.includes(incident.status)) throw httpError(409, `Incident is ${incident.status}`);
  const at = new Date().toISOString();
  const next = {
    ...incident,
    ...extra,
    status,
    history: [...(incident.history || []), { status, by, at }],
    [`${status.toLowerCase()}At`]: at,
  };
  audit.log(`INCIDENT_${status}`, { operatorId: incident.operatorId, machineId: incident.machineId, incidentId: id, by });
  return save(next);
}

const acknowledge = (id, by) => transition(id, ['OPEN'], 'ACKNOWLEDGED', by);
const resolve = (id, by, note) => transition(id, ['OPEN', 'ACKNOWLEDGED'], 'RESOLVED', by, { resolutionNote: note || null });
const cancel = (id, by) => transition(id, ['OPEN', 'ACKNOWLEDGED'], 'CANCELLED', by);

function get(id) {
  const incident = repo.get('incidents', id);
  if (!incident) throw httpError(404, `Incident ${id} not found`);
  return incident;
}

function list({ type, status, operatorId, machineId, since } = {}) {
  return repo
    .list(
      'incidents',
      (i) =>
        (!type || i.type === type) &&
        (!status || (status === 'open' ? ['OPEN', 'ACKNOWLEDGED'].includes(i.status) : i.status === status)) &&
        (!operatorId || i.operatorId === operatorId) &&
        (!machineId || i.machineId === machineId) &&
        (!since || i.createdAt >= since)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ blackBox, ...rest }) => ({ ...rest, hasBlackBox: !!blackBox }));
}

module.exports = {
  createFromAlert,
  createSos,
  createMaintenanceTicket,
  acknowledge,
  resolve,
  cancel,
  get,
  list,
};
