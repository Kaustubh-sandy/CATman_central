const express = require('express');
const taskService = require('../services/task.service');
const shiftService = require('../services/shift.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

router.get('/today', handle((req) => {
  const operatorId = operatorIdOf(req);
  const tasks = taskService.getTodayTasks(operatorId);
  return { operatorId, count: tasks.length, tasks };
}));

router.get('/history', handle((req) => {
  const operatorId = operatorIdOf(req);
  const tasks = taskService.history(operatorId, { from: req.query.from, to: req.query.to });
  return { operatorId, count: tasks.length, tasks };
}));

// Task transitions go through the shift so the shift state machine stays the source of truth.
router.post('/:taskId/start', handle((req) => shiftService.startTask(operatorIdOf(req), req.params.taskId)));
router.post('/:taskId/pause', handle((req) => shiftService.pauseTask(operatorIdOf(req))));
router.post('/:taskId/resume', handle((req) => shiftService.resumeTask(operatorIdOf(req))));
router.post('/:taskId/complete', handle((req) => shiftService.completeTask(operatorIdOf(req))));

module.exports = router;
