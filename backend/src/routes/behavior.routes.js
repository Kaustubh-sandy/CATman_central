const express = require('express');
const behaviorEngine = require('../services/behaviorEngine.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

// GET /api/behavior/skills — current skill scores for the operator (or queried operator).
router.get('/skills', handle((req) => behaviorEngine.getSkills(req.query.operatorId || operatorIdOf(req))));
router.get('/skills/:operatorId', handle((req) => behaviorEngine.getSkills(req.params.operatorId)));

// GET /api/behavior/recommendations — personalized training recommendations.
router.get('/recommendations', handle((req) => behaviorEngine.getRecommendations(req.query.operatorId || operatorIdOf(req))));

// GET /api/behavior/observations?limit=10 — recent shift observations.
router.get('/observations', handle((req) =>
  behaviorEngine.getObservations(req.query.operatorId || operatorIdOf(req), { limit: Number(req.query.limit) || 10 })
));

module.exports = router;
