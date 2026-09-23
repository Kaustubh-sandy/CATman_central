const express = require('express');
const machineController = require('../controllers/machine.controller');

const router = express.Router();

router.get('/', machineController.getFleet);

module.exports = router;
