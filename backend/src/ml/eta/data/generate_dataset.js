const fs = require("fs");
const path = require("path");

// ============================================================
// Configuration
// ============================================================

const TOTAL_SAMPLES = 50_000;

const TRAIN_RATIO = 0.70;
const VALIDATION_RATIO = 0.15;
const TEST_RATIO = 0.15;

const SEED = 42;

// Use the actual machine IDs used by the simulator.
const AVAILABLE_MACHINES = [
  "EXC001",
  "EXC002",
  "EXC003",
];

// ============================================================
// Seeded random number generator
// ============================================================

function createRandom(seed) {
  let value = seed;

  return function random() {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const random = createRandom(SEED);

// ============================================================
// Utility functions
// ============================================================

function randomFloat(min, max) {
  return min + random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomFloat(min, max + 1));
}

function randomChoice(values) {
  return values[Math.floor(random() * values.length)];
}

function round(value, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Gaussian noise using Box-Muller transform.
function randomNormal(mean = 0, stdDev = 1) {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();

  const z =
    Math.sqrt(-2 * Math.log(u1)) *
    Math.cos(2 * Math.PI * u2);

  return mean + z * stdDev;
}

// ============================================================
// Machine-specific characteristics
// ============================================================
//
// These differences are intentionally small.
// ETA should primarily depend on current operating conditions,
// not simply on machine ID.
//

const MACHINE_PROFILES = {
  EXC001: {
    efficiency: 1.00,
    temperatureOffset: 0,
    vibrationOffset: 0,
  },

  EXC002: {
    efficiency: 0.97,
    temperatureOffset: 1.5,
    vibrationOffset: 0.02,
  },

  EXC003: {
    efficiency: 1.03,
    temperatureOffset: -1,
    vibrationOffset: -0.01,
  },
};

// ============================================================
// Possible machine states
// ============================================================

const STATES = [
  "IDLE",
  "STARTING",
  "RUNNING",
  "LOADING",
  "STOPPING",
];

// ============================================================
// Possible scenarios
// ============================================================

const SCENARIOS = [
  "NORMAL",
  "SEATBELT_VIOLATION",
  "EXCESSIVE_IDLE",
  "OVERHEATING",
  "HIGH_VIBRATION",
  "PROXIMITY_HAZARD",
  "ABNORMAL_FUEL_CONSUMPTION",
];

// ============================================================
// Generate one telemetry/ETA sample
// ============================================================

function generateSample() {
  const machineId = randomChoice(AVAILABLE_MACHINES);

  const profile = MACHINE_PROFILES[machineId];

  const state = randomChoice(STATES);

  // Keep NORMAL much more common than abnormal scenarios.
  const scenarioRoll = random();

  let scenario;

  if (scenarioRoll < 0.78) {
    scenario = "NORMAL";
  } else {
    scenario = randomChoice(SCENARIOS.slice(1));
  }

  // ----------------------------------------------------------
  // Base telemetry
  // ----------------------------------------------------------

  const engineHours = round(
    randomFloat(800, 4000),
    2
  );

  let fuelLevelLitres = round(randomFloat(40, 320),2);

  let fuelConsumptionRateLph = round(randomFloat(3, 15),2);

  let loadCycles = randomInt(5, 250);

  let idleTime = round(randomFloat(0.05, 2.5),2);

  let engineRpm;

  switch (state) {
    case "IDLE":
      engineRpm = randomFloat(250, 450);
      break;

    case "STARTING":
      engineRpm = randomFloat(450, 900);
      break;

    case "LOADING":
      engineRpm = randomFloat(1200, 1800);
      break;

    case "STOPPING":
      engineRpm = randomFloat(500, 1000);
      break;

    case "RUNNING":
    default:
      engineRpm = randomFloat(900, 1700);
      break;
  }

  engineRpm = Math.round(engineRpm);

    let engineTemperature = round(
    randomFloat(68, 92) +
        profile.temperatureOffset,
    1
    );

    let hydraulicTemperature = round(
    randomFloat(60, 85),
    1
    );

    let vibration = round(
    randomFloat(0.12, 0.65) +
        profile.vibrationOffset,
    2
    );

  let seatbeltStatus = true;

  // ----------------------------------------------------------
  // Scenario effects
  // ----------------------------------------------------------

  switch (scenario) {
    case "SEATBELT_VIOLATION":
      seatbeltStatus = false;
      break;

    case "EXCESSIVE_IDLE":
      idleTime += randomFloat(2, 8);
      break;

    case "OVERHEATING":
      engineTemperature += randomFloat(10, 25);
      hydraulicTemperature += randomFloat(5, 15);
      break;

    case "HIGH_VIBRATION":
      vibration += randomFloat(0.5, 1.5);
      break;

    case "ABNORMAL_FUEL_CONSUMPTION":
      fuelConsumptionRateLph += randomFloat(5, 12);
      break;

    case "PROXIMITY_HAZARD":
      // Primarily affects operational efficiency.
      engineRpm *= randomFloat(0.75, 0.9);
      break;

    default:
      break;
  }

  // Keep telemetry within realistic ranges.

    fuelLevelLitres = round(
    clamp(fuelLevelLitres, 5, 320),
    2
    );

    fuelConsumptionRateLph = round(
    fuelConsumptionRateLph,
    2
    );

    engineTemperature = round(
    clamp(engineTemperature, 60, 125),
    1
    );

    hydraulicTemperature = round(
    clamp(hydraulicTemperature, 50, 115),
    1
    );

    vibration = round(
    clamp(vibration, 0.05, 3),
    2
    );

  // ----------------------------------------------------------
  // ETA calculation
  // ----------------------------------------------------------
  //
  // ETA represents the estimated number of minutes required
  // for the machine to complete its current operational cycle.
  //
  // Higher workload / abnormal conditions -> longer ETA.
  // Better operating conditions -> shorter ETA.
  //

  let eta = 8;

  // Current machine state.
  const stateEffect = {
    IDLE: 12,
    STARTING: 8,
    RUNNING: 5,
    LOADING: 0,
    STOPPING: 10,
  };

  eta += stateEffect[state];

  // Workload.
  eta += loadCycles * 0.035;

  // Engine utilization.
  eta += Math.max(0, engineRpm - 1200) * 0.003;

  // Fuel consumption indicates workload.
  eta += fuelConsumptionRateLph * 0.35;

  // Excessive idle time increases completion time.
  eta += idleTime * 0.8;

  // Engine age / accumulated usage.
  eta += Math.max(0, engineHours - 1000) * 0.0015;

  // Low fuel penalty.
  if (fuelLevelLitres < 60) {
    eta += (60 - fuelLevelLitres) * 0.08;
  }

  // Engine temperature penalty.
  if (engineTemperature > 90) {
    eta += (engineTemperature - 90) * 0.35;
  }

  // Hydraulic temperature penalty.
  if (hydraulicTemperature > 82) {
    eta += (hydraulicTemperature - 82) * 0.25;
  }

  // Vibration penalty.
  if (vibration > 0.6) {
    eta += (vibration - 0.6) * 8;
  }

  // Scenario effects.
  const scenarioEffect = {
    NORMAL: 0,

    SEATBELT_VIOLATION: 3,

    EXCESSIVE_IDLE: 8,

    OVERHEATING: 12,

    HIGH_VIBRATION: 10,

    PROXIMITY_HAZARD: 7,

    ABNORMAL_FUEL_CONSUMPTION: 9,
  };

  eta += scenarioEffect[scenario];

  // Machine-specific efficiency.
  eta /= profile.efficiency;

  // Small amount of real-world randomness.
  eta += randomNormal(0, 2.5);

  // Prevent unrealistic values.
  eta = clamp(eta, 3, 90);

  // ----------------------------------------------------------
  // Return dataset row
  // ----------------------------------------------------------

  return {
    machineId,
    state,
    scenario,

    engineHours,
    fuelLevelLitres,
    fuelConsumptionRateLph,

    loadCycles,
    idleTime,

    engineRpm,
    engineTemperature,
    hydraulicTemperature,
    vibration,

    seatbeltStatus,

    eta_minutes: round(eta, 2),
  };
}

// ============================================================
// CSV helpers
// ============================================================

function escapeCsvValue(value) {
  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function convertToCsv(rows) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) =>
          escapeCsvValue(row[header])
        )
        .join(",")
    ),
  ];

  return lines.join("\n");
}

// ============================================================
// Shuffle
// ============================================================

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));

    [array[i], array[j]] = [
      array[j],
      array[i],
    ];
  }

  return array;
}

// ============================================================
// Generate dataset
// ============================================================

console.log("Generating ETA dataset...\n");

const dataset = [];

for (let i = 0; i < TOTAL_SAMPLES; i++) {
  dataset.push(generateSample());
}

shuffle(dataset);

// ============================================================
// Train / validation / test split
// ============================================================

const trainSize = Math.floor(
  TOTAL_SAMPLES * TRAIN_RATIO
);

const validationSize = Math.floor(
  TOTAL_SAMPLES * VALIDATION_RATIO
);

const train = dataset.slice(
  0,
  trainSize
);

const validation = dataset.slice(
  trainSize,
  trainSize + validationSize
);

const test = dataset.slice(
  trainSize + validationSize
);

// ============================================================
// Write files
// ============================================================

const outputDirectory = path.join(__dirname);

const trainPath = path.join(
  outputDirectory,
  "train.csv"
);

const validationPath = path.join(
  outputDirectory,
  "validation.csv"
);

const testPath = path.join(
  outputDirectory,
  "test.csv"
);

fs.writeFileSync(
  trainPath,
  convertToCsv(train)
);

fs.writeFileSync(
  validationPath,
  convertToCsv(validation)
);

fs.writeFileSync(
  testPath,
  convertToCsv(test)
);

// ============================================================
// Summary
// ============================================================

console.log("ETA dataset generated successfully.\n");

console.log(`Total samples:      ${dataset.length}`);
console.log(`Training samples:   ${train.length}`);
console.log(`Validation samples: ${validation.length}`);
console.log(`Test samples:       ${test.length}`);

console.log("\nGenerated files:");

console.log(`  ${trainPath}`);
console.log(`  ${validationPath}`);
console.log(`  ${testPath}`);