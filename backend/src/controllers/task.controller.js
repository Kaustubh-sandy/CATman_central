const taskService = require('../services/task.service');
const operatorService = require('../services/operator.service');

function getToday(req, res) {
  const operatorId = req.query.operatorId || operatorService.DEFAULT_OPERATOR_ID;
  const tasks = taskService.getTodayTasks(operatorId);

  return res.status(200).json({ operatorId, count: tasks.length, tasks });
}

module.exports = { getToday };
