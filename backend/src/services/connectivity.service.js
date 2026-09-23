// Derives ONLINE / STALE / OFFLINE per machine from telemetry arrival time.
// There is no dedicated heartbeat topic yet, so each telemetry message doubles
// as a heartbeat.

const config = require('../config/env');

const STATUS = {
  ONLINE: 'ONLINE',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE',
};

const lastSeenAtMs = new Map();
const currentStatus = new Map();

let broadcastFn = null;
let monitorInterval = null;

function setBroadcaster(fn) {
  broadcastFn = fn;
}

function computeStatus(machineId) {
  const seenAt = lastSeenAtMs.get(machineId);
  if (!seenAt) return STATUS.OFFLINE;

  const ageSec = (Date.now() - seenAt) / 1000;
  if (ageSec <= config.heartbeatStaleSec) return STATUS.ONLINE;
  if (ageSec <= config.heartbeatOfflineSec) return STATUS.STALE;
  return STATUS.OFFLINE;
}

function refresh(machineId) {
  const status = computeStatus(machineId);
  const previous = currentStatus.get(machineId);

  if (status !== previous) {
    currentStatus.set(machineId, status);
    if (broadcastFn) {
      broadcastFn({
        machineId,
        status,
        lastSeenAt: getLastSeenAt(machineId),
      });
    }
  }
}

function recordSeen(machineId) {
  lastSeenAtMs.set(machineId, Date.now());
  refresh(machineId);
}

function getStatus(machineId) {
  return currentStatus.get(machineId) || STATUS.OFFLINE;
}

function getLastSeenAt(machineId) {
  const ms = lastSeenAtMs.get(machineId);
  return ms ? new Date(ms).toISOString() : null;
}

function startMonitor(getMachineIds) {
  if (monitorInterval) return;

  monitorInterval = setInterval(async () => {
    const machineIds = await getMachineIds();
    machineIds.forEach(refresh);
  }, 3000);
}

module.exports = {
  STATUS,
  setBroadcaster,
  recordSeen,
  getStatus,
  getLastSeenAt,
  startMonitor,
};
