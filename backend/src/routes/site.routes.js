const express = require('express');

const router = express.Router();

// Stub: site/conditions will later arrive over MQTT from the simulator
// (see IMPLEMENTATION_PLAN.md section 2). Static for now.
router.get('/conditions', (req, res) => {
  res.status(200).json({
    weather: 'CLEAR',
    ambientTempC: 31,
    visibility: 'GOOD',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
