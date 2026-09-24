const repo = require('../db/repo');
const telemetryStore = require('./telemetryStore.service');
const connectivityService = require('./connectivity.service');
const etaService = require('./eta.service');
const anomalyService = require('./anomalyDetection.service');

// Display-only assumption: turns fuelLevelLitres into a fuel gauge percentage.
const FUEL_TANK_CAPACITY_L = 400;

function getAllMachines() {
  return repo.list('machines').sort((a, b) => a.machineId.localeCompare(b.machineId));
}

function getMachineById(machineId) {
  return machineId ? repo.get('machines', machineId) : null;
}

function composeMachineView(machine) {
  const telemetry = telemetryStore.getLatest(machine.machineId);
  const fuelPercent = telemetry
    ? Math.max(0, Math.min(100, Math.round((telemetry.fuelLevelLitres / FUEL_TANK_CAPACITY_L) * 100)))
    : null;

  return {
    ...machine,
    connectivity: {
      status: connectivityService.getStatus(machine.machineId),
      lastSeenAt: connectivityService.getLastSeenAt(machine.machineId),
    },
    telemetry,
    fuelPercent,
    eta: etaService.get(machine.machineId),
    anomaly: anomalyService.get(machine.machineId),
  };
}

function getMachineView(machineId) {
  const machine = getMachineById(machineId);
  return machine ? composeMachineView(machine) : null;
}

function getFleet() {
  return getAllMachines().map(composeMachineView);
}

module.exports = {
  getAllMachines,
  getMachineById,
  getMachineView,
  getFleet,
  FUEL_TANK_CAPACITY_L,
};
