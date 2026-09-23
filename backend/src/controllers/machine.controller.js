const machineService = require('../services/machine.service');
const telemetryStore = require('../services/telemetryStore.service');
const connectivityService = require('../services/connectivity.service');

// Display-only assumption: used to turn fuelLevelLitres into a fuel gauge
// percentage. There is no real tank-capacity sensor field yet.
const FUEL_TANK_CAPACITY_L = 400;

function composeMachineView(machine) {
  const telemetry = telemetryStore.getLatest(machine.machineId);
  const status = connectivityService.getStatus(machine.machineId);
  const lastSeenAt = connectivityService.getLastSeenAt(machine.machineId);

  const fuelPercent = telemetry
    ? Math.max(0, Math.min(100, Math.round((telemetry.fuelLevelLitres / FUEL_TANK_CAPACITY_L) * 100)))
    : null;

  return {
    ...machine,
    connectivity: { status, lastSeenAt },
    telemetry,
    fuelPercent,
  };
}

async function getMachines(req, res, next) {
  try {
    const machines = await machineService.getAllMachines();
    return res.status(200).json({
      count: machines.length,
      machines,
    });
  } catch (error) {
    return next(error);
  }
}

async function getMachineById(req, res, next) {
  try {
    const { machineId } = req.params;
    const machine = await machineService.getMachineById(machineId);

    if (!machine) {
      return res.status(404).json({
        error: `Machine with ID '${machineId}' not found`,
      });
    }

    return res.status(200).json(composeMachineView(machine));
  } catch (error) {
    return next(error);
  }
}

async function getFleet(req, res, next) {
  try {
    const machines = await machineService.getAllMachines();
    const fleet = machines.map(composeMachineView);

    return res.status(200).json({
      count: fleet.length,
      machines: fleet,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMachines,
  getMachineById,
  getFleet,
};
