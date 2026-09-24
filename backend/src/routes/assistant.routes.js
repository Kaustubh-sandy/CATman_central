const express = require('express');
const assistantService = require('../services/assistant.service');
const insights = require('../services/assistantInsights.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();
const MAX_MESSAGE_CHARS = 1000;

router.post('/chat', handle((req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: `message must be under ${MAX_MESSAGE_CHARS} characters` });

  const history = Array.isArray(req.body.history)
    ? req.body.history
        .filter((h) => h && typeof h.text === 'string' && ['user', 'assistant'].includes(h.role))
        .map((h) => ({ role: h.role, text: h.text.slice(0, MAX_MESSAGE_CHARS) }))
    : [];

  return assistantService.chat({ operatorId: operatorIdOf(req), message, history, language: req.body.language });
}));

// The facts the assistant uses, also available directly (the panel shows reminders
// without asking the model; the offline mode and tests use the others).
router.get('/reminders', handle((req) => {
  const list = insights.reminders(operatorIdOf(req));
  return list.map((r) => {
    const nav = r.target && assistantService.NAV_TARGETS[r.target.target];
    return {
      ...r,
      text: assistantService.REMINDER_TEXT[r.code] ? assistantService.REMINDER_TEXT[r.code](r.params) : r.code,
      action: nav
        ? { type: 'navigate', target: r.target.target, route: nav.route.replace(':moduleId', r.target.moduleId || ''), focus: nav.focus, moduleId: r.target.moduleId || null }
        : null,
    };
  });
}));
router.get('/summary', handle((req) => insights.summarizeWork(operatorIdOf(req), { period: req.query.period })));
router.get('/improvement', handle((req) => insights.improvementPlan(operatorIdOf(req))));
router.get('/incident/:incidentId?', handle((req) => insights.summarizeIncident(operatorIdOf(req), { incidentId: req.params.incidentId })));

module.exports = router;
