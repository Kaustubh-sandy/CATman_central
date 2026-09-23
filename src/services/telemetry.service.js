const { db, isConfigured } = require('./firebase.service');

// In-memory fallback telemetry store (capped to last 100 entries)
const inMemoryTelemetry = [];

async function saveTelemetry(telemetryData) {
  const record = {
    machineId: telemetryData.machineId,
    engineHours: Number(telemetryData.engineHours),
    fuelUsed: Number(telemetryData.fuelUsed),
    loadCycles: Number(telemetryData.loadCycles),
    idleTime: Number(telemetryData.idleTime),
    seatbeltStatus: Boolean(telemetryData.seatbeltStatus),
    timestamp: telemetryData.timestamp || new Date().toISOString(),
  };

  if (isConfigured() && db) {
    const docRef = await db.collection('telemetry').add(record);
    return {
      id: docRef.id,
      ...record,
    };
  }

  // Fallback storage
  const mockId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const savedRecord = { id: mockId, ...record };
  inMemoryTelemetry.push(savedRecord);
  if (inMemoryTelemetry.length > 100) {
    inMemoryTelemetry.shift();
  }

  return savedRecord;
}

module.exports = {
  saveTelemetry,
};
