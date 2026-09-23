const modules = require('../data/trainingModules.json');

function listModules() {
  return modules.map(({ nodes, initialState, initialScene, start, ...summary }) => summary);
}

function getModule(moduleId) {
  return modules.find((m) => m.id === moduleId) || null;
}

module.exports = {
  listModules,
  getModule,
};
