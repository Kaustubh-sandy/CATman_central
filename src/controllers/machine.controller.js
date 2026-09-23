const machineService = require('../services/machine.service');

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

    return res.status(200).json(machine);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMachines,
  getMachineById,
};
