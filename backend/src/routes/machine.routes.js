const express = require('express');
const machineService = require('../services/machine.service');
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

module.exports = router;
