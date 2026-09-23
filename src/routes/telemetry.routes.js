const express = require('express');
const telemetryController = require('../controllers/telemetry.controller');

const router = express.Router();

router.post('/', telemetryController.recordTelemetry);

module.exports = router;
