const express = require('express');
const trainingService = require('../services/training.service');
const { handle, operatorIdOf } = require('./util');

const router = express.Router();

router.get('/modules', handle(() => {
  const modules = trainingService.listModules();
  return { count: modules.length, modules };
}));

router.get('/modules/:moduleId', handle((req, res) => {
  const module = trainingService.getModule(req.params.moduleId);
  if (!module) return res.status(404).json({ error: `Training module '${req.params.moduleId}' not found` });
  return module;
}));

router.post('/modules/:moduleId/complete', handle((req) =>
  trainingService.complete(operatorIdOf(req), req.params.moduleId, {
    score: Number(req.body.score),
    maxScore: Number(req.body.maxScore),
    violations: req.body.violations || [],
    hintsUsed: Number(req.body.hintsUsed) || 0,
    outcome: req.body.outcome,
  })
));

router.get('/progress', handle((req) => trainingService.progress(operatorIdOf(req))));
router.get('/recommended', handle((req) => trainingService.recommend(operatorIdOf(req))));

module.exports = router;
