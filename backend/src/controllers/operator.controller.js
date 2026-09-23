const operatorService = require('../services/operator.service');

function getMe(req, res) {
  const operator = operatorService.getCurrentOperator();

  if (!operator) {
    return res.status(404).json({ error: 'No operator seed data found' });
  }

  return res.status(200).json(operator);
}

module.exports = { getMe };
