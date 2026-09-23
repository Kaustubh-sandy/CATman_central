const express = require('express');
const assistantService = require('../services/assistant.service');
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

module.exports = router;
