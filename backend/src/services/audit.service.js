const repo = require('../db/repo');

function log(type, data = {}) {
  return repo.append('auditLog', {
    type,
    operatorId: data.operatorId || null,
    machineId: data.machineId || null,
    shiftId: data.shiftId || null,
    data,
    at: new Date().toISOString(),
  });
}

function recent(limit = 100) {
  return repo
    .list('auditLog')
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

module.exports = { log, recent };
