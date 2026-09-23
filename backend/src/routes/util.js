const operatorService = require('../services/operator.service');

// Wraps sync or async handlers so thrown errors reach the error middleware.
function handle(fn) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .then((result) => {
        if (!res.headersSent) res.json(result);
      })
      .catch(next);
  };
}

// No login yet: the default operator unless a caller (e.g. the control room) passes one.
function operatorIdOf(req) {
  return req.query.operatorId || req.body?.operatorId || operatorService.DEFAULT_OPERATOR_ID;
}

module.exports = { handle, operatorIdOf };
