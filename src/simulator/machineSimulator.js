const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const INTERVAL_MS = parseInt(process.env.SIMULATOR_INTERVAL_MS, 10) || 4000;

// Initial state for simulated machines
const machines = [
  {
    machineId: 'EXC001',
    engineHours: 1526.5,
    fuelUsed: 6.1,
    loadCycles: 10,
    idleTime: 15,
    seatbeltStatus: true,
  },
  {
    machineId: 'EXC002',
    engineHours: 842.2,
    fuelUsed: 4.3,
    loadCycles: 6,
    idleTime: 8,
    seatbeltStatus: true,
  },
];

let cycleCount = 0;

function updateMachineState(machine) {
  // Simulate active work
  const isActive = Math.random() > 0.3;

  if (isActive) {
    machine.engineHours = parseFloat((machine.engineHours + 0.01).toFixed(2));
    machine.fuelUsed = parseFloat((machine.fuelUsed + (0.05 + Math.random() * 0.1)).toFixed(2));

    // Increase load cycle every few active periods
    if (Math.random() > 0.5) {
      machine.loadCycles += 1;
    }
  } else {
    // Machine is idling
    machine.idleTime = parseFloat((machine.idleTime + 0.1).toFixed(1));
    machine.fuelUsed = parseFloat((machine.fuelUsed + 0.02).toFixed(2));
  }

  // Seatbelt status mostly fastened (95% chance true)
  machine.seatbeltStatus = Math.random() > 0.05;

  return {
    machineId: machine.machineId,
    engineHours: machine.engineHours,
    fuelUsed: machine.fuelUsed,
    loadCycles: machine.loadCycles,
    idleTime: machine.idleTime,
    seatbeltStatus: machine.seatbeltStatus,
  };
}

async function sendTelemetry(payload) {
  try {
    const url = `${API_BASE_URL}/api/telemetry`;
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    console.log(
      `[Simulator] -> ${payload.machineId} | Hours: ${payload.engineHours} | Fuel: ${payload.fuelUsed}L | Cycles: ${payload.loadCycles} | Idle: ${payload.idleTime}m | Belt: ${payload.seatbeltStatus ? 'YES' : 'NO'} => Server response: HTTP ${response.status}`
    );
  } catch (error) {
    if (error.response) {
      console.error(
        `[Simulator Error] Server responded with HTTP ${error.response.status} for ${payload.machineId}:`,
        error.response.data
      );
    } else {
      console.error(
        `[Simulator Error] Failed to send telemetry for ${payload.machineId}:`,
        error.message
      );
    }
  }
}

async function runSimulationTick() {
  cycleCount++;
  console.log(`\n--- [Simulator Cycle #${cycleCount} @ ${new Date().toLocaleTimeString()}] ---`);

  for (const machine of machines) {
    const payload = updateMachineState(machine);
    await sendTelemetry(payload);
  }
}

console.log('====================================================');
console.log('       CAT SMART OPERATOR - MACHINE SIMULATOR       ');
console.log('====================================================');
console.log(`Target Backend URL: ${API_BASE_URL}/api/telemetry`);
console.log(`Tick Interval:      ${INTERVAL_MS} ms`);
console.log('Simulating:         EXC001, EXC002');
console.log('Press Ctrl+C to stop simulation.');
console.log('====================================================\n');

// Run first tick immediately, then periodically
runSimulationTick();
setInterval(runSimulationTick, INTERVAL_MS);
