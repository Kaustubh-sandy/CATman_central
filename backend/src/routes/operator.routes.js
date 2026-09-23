const express = require('express');
const repo = require('../db/repo');
const operatorService = require('../services/operator.service');
const trainingService = require('../services/training.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function requireOperator(req) {
  const op = operatorService.getById(operatorIdOf(req));
  if (!op) {
    const err = new Error('Operator not found');
    err.status = 404;
    throw err;
  }
  return op;
}

router.get('/', handle(() => repo.list('operators').map(operatorService.withLevel)));

router.get('/me', handle((req) => operatorService.withLevel(requireOperator(req))));

router.patch('/me', handle((req) => {
  const op = requireOperator(req);
  return operatorService.setLanguage(op.operatorId, req.body.language);
}));

router.get('/me/profile', handle((req) => {
  const op = requireOperator(req);
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const shifts = repo
    .list('shifts', (s) => s.operatorId === op.operatorId && s.summary)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    .slice(-10);
  const alertsWeek = repo.list('alerts', (a) => a.operatorId === op.operatorId && a.detectedAt >= since);
  const alertsByRule = alertsWeek.reduce((acc, a) => ({ ...acc, [a.ruleId]: (acc[a.ruleId] || 0) + 1 }), {});

  return {
    operator: operatorService.withLevel(op),
    badges: trainingService.badges(op.operatorId),
    training: trainingService.progress(op.operatorId),
    safetyTrend: shifts.map((s) => ({
      shiftId: s.id,
      endedAt: s.endedAt,
      safetyScore: s.summary.safetyScore,
      tasksDone: s.summary.tasksDone,
      alerts: s.summary.alerts.total,
    })),
    alertsThisWeek: { total: alertsWeek.length, byRule: alertsByRule },
  };
}));

module.exports = router;
