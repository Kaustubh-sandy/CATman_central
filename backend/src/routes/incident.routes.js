const express = require('express');
const incidentService = require('../services/incident.service');
const shiftService = require('../services/shift.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

router.get('/', handle((req) =>
  incidentService.list({
    type: req.query.type,
    status: req.query.status,
    operatorId: req.query.operatorId,
    machineId: req.query.machineId,
    since: req.query.since,
  })
));

router.post('/sos', handle((req) => {
  const operatorId = operatorIdOf(req);
  const shift = shiftService.getCurrent(operatorId);
  return incidentService.createSos({ operatorId, machineId: shift.machineId, note: req.body.note });
}));

router.get('/:incidentId', handle((req) => incidentService.get(req.params.incidentId)));
router.post('/:incidentId/ack', handle((req) => incidentService.acknowledge(req.params.incidentId, req.body.by || 'SUPERVISOR')));
router.post('/:incidentId/resolve', handle((req) => incidentService.resolve(req.params.incidentId, req.body.by || 'SUPERVISOR', req.body.note)));
router.post('/:incidentId/cancel', handle((req) => incidentService.cancel(req.params.incidentId, req.body.by || operatorIdOf(req))));

module.exports = router;
