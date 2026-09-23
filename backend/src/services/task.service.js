const tasksByOperator = require('../data/tasks.json');

function getTodayTasks(operatorId) {
  return tasksByOperator[operatorId] || [];
}

module.exports = {
  getTodayTasks,
};
