const express = require('express');
const alertService = require('../services/alert.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

router.get('/', handle((req) =>
  alertService.list({
    status: req.query.status,
    machineId: req.query.machineId,
    since: req.query.since,
    limit: Number(req.query.limit) || 100,
  })
));

router.get('/:alertId', handle((req) => alertService.get(req.params.alertId)));
router.post('/:alertId/ack', handle((req) => alertService.acknowledge(req.params.alertId, req.body.by || operatorIdOf(req))));
router.post('/:alertId/resolve', handle((req) => alertService.resolve(req.params.alertId, req.body.by || operatorIdOf(req))));

module.exports = router;
