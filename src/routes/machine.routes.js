const express = require('express');
const machineController = require('../controllers/machine.controller');

const router = express.Router();

router.get('/', machineController.getMachines);
router.get('/:machineId', machineController.getMachineById);

module.exports = router;
