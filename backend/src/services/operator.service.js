const repo = require('../db/repo');
const { emit } = require('../socket/socket');

// No login yet: the dashboard always operates as this operator.
const DEFAULT_OPERATOR_ID = 'OP1001';
const LANGUAGES = ['en', 'hi', 'ta'];
const XP_PER_LEVEL = 200;

function getById(operatorId) {
  return repo.get('operators', operatorId);
}

function getCurrentOperator() {
  return getById(DEFAULT_OPERATOR_ID);
}

function levelFor(xp) {
  return Math.floor((xp || 0) / XP_PER_LEVEL) + 1;
}

function withLevel(op) {
  if (!op) return null;
  const xp = op.xp || 0;
  return { ...op, xp, level: levelFor(xp), xpIntoLevel: xp % XP_PER_LEVEL, xpPerLevel: XP_PER_LEVEL };
}

function setLanguage(operatorId, language) {
  if (!LANGUAGES.includes(language)) {
    const err = new Error(`language must be one of ${LANGUAGES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  const updated = repo.patch('operators', operatorId, { language });
  emit('operator:updated', withLevel(updated));
  return withLevel(updated);
}

function addXp(operatorId, amount, reason) {
  if (!amount) return withLevel(getById(operatorId));
  const op = getById(operatorId);
  const updated = repo.patch('operators', operatorId, { xp: (op.xp || 0) + amount });
  emit('xp:awarded', { operatorId, amount, reason, total: updated.xp, level: levelFor(updated.xp) });
  emit('operator:updated', withLevel(updated));
  return withLevel(updated);
}

module.exports = {
  DEFAULT_OPERATOR_ID,
  LANGUAGES,
  getById,
  getCurrentOperator,
  withLevel,
  levelFor,
  setLanguage,
  addXp,
};
