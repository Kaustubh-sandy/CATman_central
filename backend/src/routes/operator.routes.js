const express = require('express');
const operatorController = require('../controllers/operator.controller');

const router = express.Router();

router.get('/me', operatorController.getMe);

module.exports = router;
