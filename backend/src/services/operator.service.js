const operators = require('../data/operators.json');

// No auth yet: the dashboard always operates as the first seeded operator.
const DEFAULT_OPERATOR_ID = operators[0]?.operatorId || null;

function getById(operatorId) {
  return operators.find((op) => op.operatorId === operatorId) || null;
}

function getCurrentOperator() {
  return getById(DEFAULT_OPERATOR_ID);
}

module.exports = {
  getById,
  getCurrentOperator,
  DEFAULT_OPERATOR_ID,
};
