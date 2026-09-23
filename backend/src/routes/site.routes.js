const express = require('express');
const siteService = require('../services/site.service');
const shiftService = require('../services/shift.service');
const telemetryStore = require('../services/telemetryStore.service');
const { computeEnvelope } = require('../services/safety.engine');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

router.get('/conditions', handle((req) => {
  const site = siteService.get();
  const shift = shiftService.getCurrent(operatorIdOf(req));
  const t = telemetryStore.getLatest(shift.machineId) || {};
  return { ...site, envelope: computeEnvelope(t, site) };
}));

module.exports = router;
