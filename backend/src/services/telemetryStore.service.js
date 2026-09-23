// In-memory latest telemetry + short rolling history per machine.
// No persistence: this is rebuilt from live MQTT traffic on every restart.

const HISTORY_LIMIT = 150; // ~10 min of history at a 4s publish interval

const latestByMachine = new Map();
const historyByMachine = new Map();

function update(machineId, payload) {
  latestByMachine.set(machineId, payload);

  const history = historyByMachine.get(machineId) || [];
  history.push(payload);
  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }
  historyByMachine.set(machineId, history);
}

function getLatest(machineId) {
  return latestByMachine.get(machineId) || null;
}

function getHistory(machineId) {
  return historyByMachine.get(machineId) || [];
}

module.exports = {
  update,
  getLatest,
  getHistory,
};
