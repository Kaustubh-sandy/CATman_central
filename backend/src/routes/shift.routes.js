const express = require('express');
const shiftService = require('../services/shift.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

router.get('/current', handle((req) => shiftService.getCurrent(operatorIdOf(req))));

router.post('/precheck', handle((req) => shiftService.startPrecheck(operatorIdOf(req))));
router.post('/precheck/cancel', handle((req) => shiftService.cancelPrecheck(operatorIdOf(req))));
router.post('/precheck/ack-warnings', handle((req) => shiftService.acknowledgeWarnings(operatorIdOf(req))));
router.post('/switch-machine', handle((req) => shiftService.switchMachine(operatorIdOf(req), req.body.machineId)));

router.post('/checklist/item', handle((req) => shiftService.checkItem(operatorIdOf(req), req.body.item, req.body.checked !== false)));
router.post('/checklist/horn', handle((req) => shiftService.testHorn(operatorIdOf(req))));
router.post('/checklist/complete', handle((req) => shiftService.completeChecklist(operatorIdOf(req))));

router.post('/task/start', handle((req) => shiftService.startTask(operatorIdOf(req), req.body.taskId)));
router.post('/task/pause', handle((req) => shiftService.pauseTask(operatorIdOf(req))));
router.post('/task/resume', handle((req) => shiftService.resumeTask(operatorIdOf(req))));
router.post('/task/complete', handle((req) => shiftService.completeTask(operatorIdOf(req))));

router.post('/end', handle((req) => shiftService.endShift(operatorIdOf(req), req.body.handoverNote)));
router.post('/new', handle((req) => shiftService.newShift(operatorIdOf(req))));

module.exports = router;
