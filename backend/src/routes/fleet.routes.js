const express = require('express');
const machineService = require('../services/machine.service');
const { handle } = require('./util');

const router = express.Router();

router.get('/', handle(() => {
  const machines = machineService.getFleet();
  return { count: machines.length, machines };
}));

module.exports = router;
