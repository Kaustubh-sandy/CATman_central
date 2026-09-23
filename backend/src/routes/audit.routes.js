const express = require('express');
const audit = require('../services/audit.service');
const { handle } = require('./util');

const router = express.Router();

router.get('/', handle((req) => audit.recent(Math.min(Number(req.query.limit) || 100, 500))));

module.exports = router;
