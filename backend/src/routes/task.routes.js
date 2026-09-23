const express = require('express');
const taskController = require('../controllers/task.controller');

const router = express.Router();

router.get('/today', taskController.getToday);

module.exports = router;
