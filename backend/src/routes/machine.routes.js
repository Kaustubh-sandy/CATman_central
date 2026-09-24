const express = require('express');
const machineService = require('../services/machine.service');
const etaService = require('../services/eta.service');
const { handle } = require('./util');

const router = express.Router();

router.get('/', handle(() => {
  const machines = machineService.getAllMachines();
  return { count: machines.length, machines };
}));

router.get('/:machineId', handle((req, res) => {
  const view = machineService.getMachineView(req.params.machineId);
  if (!view) return res.status(404).json({ error: `Machine with ID '${req.params.machineId}' not found` });
  return view;
}));

// Latest ETA from the Python model for this machine's active task (null until the first run).
router.get('/:machineId/eta', handle((req, res) => {
  if (!machineService.getMachineById(req.params.machineId)) {
    return res.status(404).json({ error: `Machine with ID '${req.params.machineId}' not found` });
  }
  return { machineId: req.params.machineId, eta: etaService.get(req.params.machineId), status: etaService.getStatus() };
}));

module.exports = router;
