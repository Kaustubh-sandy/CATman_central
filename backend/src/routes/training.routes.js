const express = require('express');
const trainingController = require('../controllers/training.controller');

const router = express.Router();

router.get('/modules', trainingController.listModules);
router.get('/modules/:moduleId', trainingController.getModule);

module.exports = router;
