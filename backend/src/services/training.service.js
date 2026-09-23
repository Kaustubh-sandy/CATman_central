const modules = require('../data/trainingModules.json');
const repo = require('../db/repo');
const audit = require('./audit.service');
const operatorService = require('./operator.service');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PASS_RATIO = 0.7;

// Which safety alert (or behaviour) points to which simulator module.
const RULE_TO_MODULE = {
  SEATBELT_VIOLATION: 'SIM_STARTUP',
  LOCKOUT_NOT_ENGAGED: 'SIM_SHUTDOWN',
  UNATTENDED_MACHINE: 'SIM_SHUTDOWN',
  PROXIMITY_CRITICAL: 'SIM_PROXIMITY_RAIN',
  PROXIMITY_WARNING: 'SIM_PROXIMITY_RAIN',
  OVERHEATING: 'SIM_OVERHEAT',
  LOW_OIL_PRESSURE: 'SIM_OVERHEAT',
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function listModules() {
  return modules.map(({ nodes, initialState, initialScene, start, ...summary }) => summary);
}

function getModule(moduleId) {
  return modules.find((m) => m.id === moduleId) || null;
}

function attempts(operatorId) {
  return repo
    .list('trainingProgress', (p) => p.operatorId === operatorId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

function progress(operatorId) {
  const all = attempts(operatorId);
  return listModules().map((m) => {
    const mine = all.filter((a) => a.moduleId === m.id);
    const best = mine.reduce((b, a) => (!b || a.score > b.score ? a : b), null);
    return {
      moduleId: m.id,
      title: m.title,
      attempts: mine.length,
      passed: mine.some((a) => a.passed),
      bestScore: best ? best.score : null,
      maxScore: best ? best.maxScore : null,
      xpEarned: mine.reduce((sum, a) => sum + (a.xpAwarded || 0), 0),
      lastAttemptAt: mine[0]?.completedAt || null,
    };
  });
}

function complete(operatorId, moduleId, { score, maxScore, violations = [], hintsUsed = 0, outcome }) {
  const module = getModule(moduleId);
  if (!module) throw httpError(404, `Module ${moduleId} not found`);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) throw httpError(400, 'score and maxScore are required');

  const ratio = Math.max(0, score) / maxScore;
  const passed = outcome !== 'FAIL' && ratio >= PASS_RATIO;
  const earned = passed ? Math.round(module.xp * Math.min(1, ratio)) : 0;

  // XP only for improving on your best, so replaying a module can't farm XP.
  const previousBest = attempts(operatorId)
    .filter((a) => a.moduleId === moduleId)
    .reduce((max, a) => Math.max(max, a.xpPotential || 0), 0);
  const xpAwarded = Math.max(0, earned - previousBest);

  const record = repo.add('trainingProgress', {
    id: `${operatorId}-${moduleId}-${Date.now()}`,
    operatorId,
    moduleId,
    skill: module.skill,
    score,
    maxScore,
    passed,
    outcome: outcome || null,
    violations,
    hintsUsed,
    xpPotential: earned,
    xpAwarded,
    completedAt: new Date().toISOString(),
  });
  audit.log('TRAINING_COMPLETED', { operatorId, moduleId, score, maxScore, passed, xpAwarded });
  const operator = operatorService.addXp(operatorId, xpAwarded, `TRAINING_${moduleId}`);
  return { record, operator };
}

// Recommendations with a reason code + params so the UI can translate them.
function recommend(operatorId) {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const alerts = repo.list('alerts', (a) => a.operatorId === operatorId && a.detectedAt >= since);
  const passed = new Set(attempts(operatorId).filter((a) => a.passed && a.completedAt >= since).map((a) => a.moduleId));

  const counts = {};
  alerts.forEach((a) => {
    const moduleId = RULE_TO_MODULE[a.ruleId];
    if (!moduleId) return;
    counts[moduleId] = counts[moduleId] || { count: 0, rules: {} };
    counts[moduleId].count += 1;
    counts[moduleId].rules[a.ruleId] = (counts[moduleId].rules[a.ruleId] || 0) + 1;
  });

  const fromAlerts = Object.entries(counts)
    .filter(([moduleId]) => !passed.has(moduleId))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([moduleId, { count, rules }]) => {
      const topRule = Object.entries(rules).sort((a, b) => b[1] - a[1])[0][0];
      return { moduleId, reasonCode: 'ALERTS_THIS_WEEK', params: { count, rule: topRule } };
    });

  const everPassed = new Set(attempts(operatorId).filter((a) => a.passed).map((a) => a.moduleId));
  const notDone = listModules()
    .filter((m) => !everPassed.has(m.id) && !fromAlerts.some((r) => r.moduleId === m.id))
    .map((m) => ({ moduleId: m.id, reasonCode: 'NOT_COMPLETED', params: {} }));

  return [...fromAlerts, ...notDone].map((r) => ({ ...r, module: listModules().find((m) => m.id === r.moduleId) }));
}

function badges(operatorId) {
  const done = attempts(operatorId);
  const passedIds = new Set(done.filter((a) => a.passed).map((a) => a.moduleId));
  const shifts = repo.list('shifts', (s) => s.operatorId === operatorId && s.summary);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const weekShifts = shifts.filter((s) => s.endedAt >= weekAgo);
  const beltAlertsWeek = repo.list('alerts', (a) => a.operatorId === operatorId && a.ruleId === 'SEATBELT_VIOLATION' && a.detectedAt >= weekAgo).length;
  const criticalWeek = repo.list('alerts', (a) => a.operatorId === operatorId && a.severity === 'CRITICAL' && a.detectedAt >= weekAgo).length;

  return [
    { id: 'FIRST_SIMULATION', earned: passedIds.size > 0 },
    { id: 'ALL_SIMULATIONS', earned: modules.every((m) => passedIds.has(m.id)) },
    { id: 'CLEAN_SHIFT', earned: shifts.some((s) => s.summary.cleanShift && s.summary.tasksDone > 0) },
    { id: 'SEATBELT_STREAK', earned: weekShifts.length >= 1 && beltAlertsWeek === 0 },
    { id: 'ZERO_INCIDENT_WEEK', earned: weekShifts.length >= 1 && criticalWeek === 0 },
  ];
}

module.exports = {
  listModules,
  getModule,
  complete,
  progress,
  recommend,
  badges,
  attempts,
};
