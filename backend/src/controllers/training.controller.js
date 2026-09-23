const trainingService = require('../services/training.service');

function listModules(req, res) {
  const modules = trainingService.listModules();
  return res.status(200).json({ count: modules.length, modules });
}

function getModule(req, res) {
  const module = trainingService.getModule(req.params.moduleId);

  if (!module) {
    return res.status(404).json({ error: `Training module '${req.params.moduleId}' not found` });
  }

  return res.status(200).json(module);
}

module.exports = { listModules, getModule };
