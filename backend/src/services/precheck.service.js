const { randomUUID } = require('crypto');
const config = require('../config/env');
const bus = require('./bus');
const mqttService = require('./mqtt.service');

// Must match caterpillar-machine-simulator/src/sensors.js (MQTT contract).
const SENSORS = [
  'ENGINE_ECU', 'FUEL_SENSOR', 'HYDRAULIC_TEMP', 'ENGINE_TEMP', 'OIL_PRESSURE',
  'VIBRATION', 'SEATBELT_SENSOR', 'SEAT_PRESENCE', 'GPS', 'PROXIMITY_FRONT',
  'PROXIMITY_REAR', 'TILT_SENSOR', 'BRAKES', 'LIGHTS_HORN', 'CAMERA',
];
const CRITICAL = new Set(['ENGINE_ECU', 'BRAKES', 'SEATBELT_SENSOR', 'PROXIMITY_FRONT', 'PROXIMITY_REAR', 'TILT_SENSOR']);

// requestId -> { shiftId, machineId, operatorId, timers }
const sessions = new Map();
let handlers = { onUpdate: () => {}, onComplete: () => {} };

function configure(next) {
  handlers = next;
}

// Backend is the authority on the overall result: a FAIL (or no reply) on any
// critical sensor fails the pre-check; anything else non-OK is a warning.
function evaluate(sensors) {
  if (sensors.every((s) => s.status === 'NO_RESPONSE')) return 'FAIL';
  const blocking = sensors.filter((s) => CRITICAL.has(s.sensor) && (s.status === 'FAIL' || s.status === 'NO_RESPONSE'));
  if (blocking.length) return 'FAIL';
  if (sensors.some((s) => s.status !== 'OK')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

function withAllSensors(reported) {
  const byId = new Map(reported.map((s) => [s.sensor, s]));
  return SENSORS.map(
    (id) =>
      byId.get(id) || {
        sensor: id,
        label: id.replaceAll('_', ' '),
        critical: CRITICAL.has(id),
        status: 'NO_RESPONSE',
        message: 'No reply from sensor',
      }
  ).map((s) => ({ ...s, critical: CRITICAL.has(s.sensor) }));
}

function clearTimers(session) {
  Object.values(session.timers).forEach(clearTimeout);
  session.timers = {};
}

function finish(requestId, { sensors, verifiedBy, reason }) {
  const session = sessions.get(requestId);
  if (!session) return;
  clearTimers(session);
  sessions.delete(requestId);

  const all = withAllSensors(sensors);
  handlers.onComplete(session.shiftId, {
    requestId,
    status: reason === 'RESULT' ? 'DONE' : 'TIMEOUT',
    reason,
    overall: evaluate(all),
    sensors: all,
    verifiedBy: verifiedBy || null,
    completedAt: new Date().toISOString(),
    noResponse: sensors.length === 0,
  });
}

function start({ shiftId, machineId, operatorId }) {
  const requestId = randomUUID();
  mqttService.publishCommand(machineId, 'precheck', {
    requestId,
    operatorId,
    timestamp: new Date().toISOString(),
  });

  const session = { shiftId, machineId, operatorId, reported: [], timers: {} };
  session.timers.ack = setTimeout(
    () => finish(requestId, { sensors: [], reason: 'NO_RESPONSE' }),
    config.precheckAckTimeoutMs
  );
  sessions.set(requestId, session);

  return {
    requestId,
    machineId,
    mode: null,
    status: 'WAITING_ACK',
    sensors: [],
    total: SENSORS.length,
    overall: null,
    startedAt: new Date().toISOString(),
  };
}

function cancel(requestId) {
  const session = sessions.get(requestId);
  if (!session) return;
  clearTimers(session);
  sessions.delete(requestId);
  try {
    mqttService.publishCommand(session.machineId, 'precheck-cancel', { requestId });
  } catch (err) {
    console.error('[Precheck] Cancel not delivered:', err.message);
  }
}

function init() {
  bus.on('precheckAck', (machineId, { requestId, mode }) => {
    const session = sessions.get(requestId);
    if (!session) return;
    clearTimeout(session.timers.ack);
    session.timers.result = setTimeout(
      () => finish(requestId, { sensors: session.reported, reason: 'TIMEOUT' }),
      mode === 'MANUAL' ? config.precheckManualTimeoutMs : config.precheckAutoResultTimeoutMs
    );
    const expiresAt = new Date(
      Date.now() + (mode === 'MANUAL' ? config.precheckManualTimeoutMs : config.precheckAutoResultTimeoutMs)
    ).toISOString();
    handlers.onUpdate(session.shiftId, (p) => ({ ...p, mode, status: 'RUNNING', ackedAt: new Date().toISOString(), expiresAt }));
  });

  bus.on('precheckProgress', (machineId, { requestId, sensor }) => {
    const session = sessions.get(requestId);
    if (!session || !sensor) return;
    const item = { ...sensor, critical: CRITICAL.has(sensor.sensor), receivedAt: new Date().toISOString() };
    session.reported = [...session.reported.filter((s) => s.sensor !== sensor.sensor), item];
    handlers.onUpdate(session.shiftId, (p) => ({
      ...p,
      status: 'RUNNING',
      sensors: [...(p.sensors || []).filter((s) => s.sensor !== sensor.sensor), item],
    }));
  });

  bus.on('precheckResult', (machineId, { requestId, sensors, verifiedBy }) => {
    if (!sessions.has(requestId)) return;
    finish(requestId, { sensors: sensors || [], verifiedBy, reason: 'RESULT' });
  });
}

module.exports = { init, configure, start, cancel, evaluate, SENSORS, CRITICAL };
