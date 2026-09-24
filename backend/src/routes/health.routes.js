const express = require('express');
const repo = require('../db/repo');
const mqttService = require('../services/mqtt.service');
const etaService = require('../services/eta.service');
const config = require('../config/env');
const { handle } = require('./util');

const router = express.Router();

router.get(
  '/',
  handle(() => ({
    status: 'ok',
    service: 'cat-machine-backend',
    mqtt: mqttService.isConnected() ? 'CONNECTED' : 'DISCONNECTED',
    storage: repo.getStatus(),
    assistant: config.gemini.apiKey ? 'GEMINI' : 'OFFLINE',
    eta: etaService.getStatus(),
  }))
);

module.exports = router;
