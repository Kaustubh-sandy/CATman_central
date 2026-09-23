const telemetryService = require('../services/telemetry.service');
const machineService = require('../services/machine.service');
const { broadcastTelemetry } = require('../socket/socket');

async function recordTelemetry(req, res, next) {
  try {
    const {
      machineId,
      engineHours,
      fuelUsed,
      loadCycles,
      idleTime,
      seatbeltStatus,
      timestamp,
    } = req.body;

    // 1. Basic validation
    if (!machineId || typeof machineId !== 'string' || !machineId.trim()) {
      return res.status(400).json({ error: 'machineId is required and must be a string' });
    }

    if (engineHours === undefined || isNaN(Number(engineHours))) {
      return res.status(400).json({ error: 'engineHours is required and must be a valid number' });
    }

    if (fuelUsed === undefined || isNaN(Number(fuelUsed))) {
      return res.status(400).json({ error: 'fuelUsed is required and must be a valid number' });
    }

    if (loadCycles === undefined || isNaN(Number(loadCycles))) {
      return res.status(400).json({ error: 'loadCycles is required and must be a valid number' });
    }

    if (idleTime === undefined || isNaN(Number(idleTime))) {
      return res.status(400).json({ error: 'idleTime is required and must be a valid number' });
    }

    if (seatbeltStatus === undefined || typeof seatbeltStatus !== 'boolean') {
      return res.status(400).json({ error: 'seatbeltStatus is required and must be a boolean' });
    }

    // 2. Check if machine exists
    const machine = await machineService.getMachineById(machineId);
    if (!machine) {
      return res.status(404).json({
        error: `Machine with ID '${machineId}' is not registered in the system`,
      });
    }

    // 3. Save telemetry
    const savedTelemetry = await telemetryService.saveTelemetry({
      machineId,
      engineHours: Number(engineHours),
      fuelUsed: Number(fuelUsed),
      loadCycles: Number(loadCycles),
      idleTime: Number(idleTime),
      seatbeltStatus: Boolean(seatbeltStatus),
      timestamp: timestamp || new Date().toISOString(),
    });

    // 4. Broadcast through Socket.IO
    broadcastTelemetry(savedTelemetry);

    // 5. Return saved telemetry
    return res.status(201).json(savedTelemetry);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  recordTelemetry,
};
