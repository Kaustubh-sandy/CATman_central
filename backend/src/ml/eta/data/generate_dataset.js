const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const TOTAL_SAMPLES = 50_000;

const TRAIN_RATIO = 0.70;
const VALIDATION_RATIO = 0.15;
const TEST_RATIO = 0.15;

const SEED = 42;

const INTERVAL_MS = 4000;

const AVAILABLE_MACHINES = [
  "EXC001",
  "EXC002",
  "EXC003",
];


/*
 * ============================================================
 * SEEDED RANDOM NUMBER GENERATOR
 * ============================================================
 */

function createRandom(seed) {
  let value = seed;

  return function random() {
    value =
      (value * 1664525 + 1013904223) %
      4294967296;

    return value / 4294967296;
  };
}

const random = createRandom(SEED);


/*
 * ============================================================
 * UTILITY FUNCTIONS
 * ============================================================
 */

function randomFloat(min, max) {
  return min + random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(
    randomFloat(min, max + 1)
  );
}

function randomChoice(values) {
  return values[
    Math.floor(random() * values.length)
  ];
}

function round(value, decimals = 2) {
  const multiplier = 10 ** decimals;

  return (
    Math.round(value * multiplier) /
    multiplier
  );
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function randomNormal(
  mean = 0,
  stdDev = 1
) {
  const u1 = Math.max(
    random(),
    Number.EPSILON
  );

  const u2 = random();

  const z =
    Math.sqrt(
      -2 * Math.log(u1)
    ) *
    Math.cos(
      2 * Math.PI * u2
    );

  return mean + z * stdDev;
}


/*
 * ============================================================
 * MACHINE STATES
 *
 * Mirrors the simulator.
 * ============================================================
 */

const STATES = {
  IDLE: "IDLE",
  STARTING: "STARTING",
  OPERATING: "OPERATING",
  LOADING: "LOADING",
  TRANSPORTING: "TRANSPORTING",
  UNLOADING: "UNLOADING",
};

const STATE_DURATIONS = {
  IDLE: 4,
  STARTING: 2,
  OPERATING: 4,
  LOADING: 4,
  TRANSPORTING: 5,
  UNLOADING: 3,
};

const STATE_TRANSITIONS = {
  IDLE: STATES.STARTING,
  STARTING: STATES.OPERATING,
  OPERATING: STATES.LOADING,
  LOADING: STATES.TRANSPORTING,
  TRANSPORTING: STATES.UNLOADING,
  UNLOADING: STATES.IDLE,
};


/*
 * ============================================================
 * SCENARIOS
 *
 * These names mirror the simulator.
 * ============================================================
 */

const SCENARIOS = {
  NORMAL: "NORMAL",

  SEATBELT_VIOLATION:
    "SEATBELT_VIOLATION",

  EXCESSIVE_IDLE:
    "EXCESSIVE_IDLE",

  OVERHEATING:
    "OVERHEATING",

  HIGH_VIBRATION:
    "HIGH_VIBRATION",

  PROXIMITY_HAZARD:
    "PROXIMITY_HAZARD",

  ABNORMAL_FUEL_CONSUMPTION:
    "ABNORMAL_FUEL_CONSUMPTION",
};

const ABNORMAL_SCENARIOS = [
  SCENARIOS.SEATBELT_VIOLATION,
  SCENARIOS.EXCESSIVE_IDLE,
  SCENARIOS.OVERHEATING,
  SCENARIOS.HIGH_VIBRATION,
  SCENARIOS.PROXIMITY_HAZARD,
  SCENARIOS.ABNORMAL_FUEL_CONSUMPTION,
];


/*
 * ============================================================
 * STATE-DEPENDENT TELEMETRY
 *
 * Mirrors the simulator.
 * ============================================================
 */

const FUEL_CONSUMPTION_RATES = {
  IDLE: 4,
  STARTING: 8,
  OPERATING: 14,
  LOADING: 22,
  TRANSPORTING: 18,
  UNLOADING: 16,
};

const RPM_TARGETS = {
  IDLE: 300,
  STARTING: 900,
  OPERATING: 1500,
  LOADING: 1850,
  TRANSPORTING: 1600,
  UNLOADING: 1300,
};

const ENGINE_TEMPERATURE_TARGETS = {
  IDLE: 70,
  STARTING: 74,
  OPERATING: 80,
  LOADING: 88,
  TRANSPORTING: 84,
  UNLOADING: 82,
};

const HYDRAULIC_TEMPERATURE_TARGETS = {
  IDLE: 65,
  STARTING: 68,
  OPERATING: 72,
  LOADING: 90,
  TRANSPORTING: 82,
  UNLOADING: 85,
};

const VIBRATION_TARGETS = {
  IDLE: 0.15,
  STARTING: 0.25,
  OPERATING: 0.35,
  LOADING: 0.65,
  TRANSPORTING: 0.55,
  UNLOADING: 0.45,
};


/*
 * ============================================================
 * MACHINE CREATION
 *
 * Mirrors the important initial values of the simulator.
 * ============================================================
 */

function createMachine(machineId) {
  return {
    machineId,

    state: STATES.IDLE,
    stateTicks: 0,

    engineHours: round(
      1000 + randomFloat(0, 600),
      2
    ),

    fuelLevelLitres: 320,

    fuelConsumedLitres: 1280,

    fuelConsumptionRateLph: 0,

    fuelConsumptionMultiplier: 1,

    loadCycles: randomInt(5, 14),

    idleTime: 0,

    engineRpm: 300,

    engineTemperature: 70,

    hydraulicTemperature: 65,

    vibration: 0.15,

    seatbeltStatus: true,

    latitude: 12.970000,
    longitude: 79.156000,
  };
}


/*
 * ============================================================
 * SMOOTH VALUE TRANSITION
 *
 * Mirrors the simulator's approach() behavior.
 * ============================================================
 */

function approach(
  current,
  target,
  step
) {
  if (current < target) {
    return Math.min(
      current + step,
      target
    );
  }

  if (current > target) {
    return Math.max(
      current - step,
      target
    );
  }

  return current;
}


/*
 * ============================================================
 * UPDATE MACHINE STATE
 *
 * Mirrors the simulator's state machine.
 * ============================================================
 */

function updateMachineState(machine) {
  machine.stateTicks++;

  const duration =
    STATE_DURATIONS[machine.state];

  if (
    machine.stateTicks >= duration
  ) {
    machine.state =
      STATE_TRANSITIONS[machine.state];

    machine.stateTicks = 0;
  }
}


/*
 * ============================================================
 * APPLY SCENARIO
 *
 * Mirrors the relevant simulator behavior.
 * ============================================================
 */

function applyScenario(machine) {
  machine.fuelConsumptionMultiplier = 1;

  switch (machine.scenario) {

    case SCENARIOS.SEATBELT_VIOLATION:
      machine.seatbeltStatus = false;
      break;

    case SCENARIOS.EXCESSIVE_IDLE:
      machine.state = STATES.IDLE;
      machine.engineRpm = 700;
      machine.idleTime += 0.4;
      break;

    case SCENARIOS.OVERHEATING:
      machine.engineTemperature =
        Math.max(
          machine.engineTemperature,
          95
        );

      machine.hydraulicTemperature =
        Math.max(
          machine.hydraulicTemperature,
          92
        );

      break;

    case SCENARIOS.HIGH_VIBRATION:
      machine.vibration =
        Math.max(
          machine.vibration,
          1.2
        );

      break;

    case SCENARIOS.ABNORMAL_FUEL_CONSUMPTION:
      machine.fuelConsumptionMultiplier =
        1.6;

      break;

    case SCENARIOS.PROXIMITY_HAZARD:
      /*
       * The simulator treats this primarily
       * as a location/proximity condition.
       *
       * It is retained here so scenario
       * distribution matches the simulator.
       */
      machine.latitude = 12.9705;
      machine.longitude = 79.1565;

      break;

    default:
      break;
  }
}


/*
 * ============================================================
 * UPDATE SEATBELT
 *
 * Mirrors simulator behavior.
 * ============================================================
 */

function updateSeatbelt(machine) {
  if (
    machine.scenario !==
    SCENARIOS.SEATBELT_VIOLATION
  ) {
    machine.seatbeltStatus = true;
  }
}


/*
 * ============================================================
 * UPDATE TELEMETRY
 *
 * Mirrors the relevant simulator telemetry
 * calculations.
 * ============================================================
 */

function updateTelemetry(
  machine,
  intervalMs
) {
  const state = machine.state;

  const simulationIntervalSeconds =
    intervalMs / 1000;

  const hoursPerTick =
    simulationIntervalSeconds / 3600;


  /*
   * ----------------------------------------------------------
   * ENGINE RPM
   * ----------------------------------------------------------
   */

  machine.engineRpm =
    approach(
      machine.engineRpm,
      RPM_TARGETS[state],
      150
    );


  /*
   * ----------------------------------------------------------
   * ENGINE TEMPERATURE
   * ----------------------------------------------------------
   */

  machine.engineTemperature =
    approach(
      machine.engineTemperature,
      ENGINE_TEMPERATURE_TARGETS[state],
      2
    );


  /*
   * ----------------------------------------------------------
   * HYDRAULIC TEMPERATURE
   * ----------------------------------------------------------
   */

  machine.hydraulicTemperature =
    approach(
      machine.hydraulicTemperature,
      HYDRAULIC_TEMPERATURE_TARGETS[state],
      2
    );


  /*
   * ----------------------------------------------------------
   * VIBRATION
   * ----------------------------------------------------------
   */

  machine.vibration =
    approach(
      machine.vibration,
      VIBRATION_TARGETS[state],
      0.08
    );


  /*
   * ----------------------------------------------------------
   * FUEL CONSUMPTION
   * ----------------------------------------------------------
   */

  const baseFuelConsumptionRate =
    FUEL_CONSUMPTION_RATES[state];

  machine.fuelConsumptionRateLph =
    baseFuelConsumptionRate *
    machine.fuelConsumptionMultiplier;


  /*
   * ----------------------------------------------------------
   * FUEL CONSUMED THIS TICK
   * ----------------------------------------------------------
   */

  const fuelConsumedThisTick =
    machine.fuelConsumptionRateLph *
    hoursPerTick;


  /*
   * ----------------------------------------------------------
   * CUMULATIVE FUEL
   * ----------------------------------------------------------
   */

  machine.fuelConsumedLitres +=
    fuelConsumedThisTick;


  /*
   * ----------------------------------------------------------
   * CURRENT FUEL LEVEL
   * ----------------------------------------------------------
   */

  machine.fuelLevelLitres =
    Math.max(
      0,
      machine.fuelLevelLitres -
        fuelConsumedThisTick
    );


  /*
   * ----------------------------------------------------------
   * ENGINE HOURS
   * ----------------------------------------------------------
   */

  machine.engineHours +=
    hoursPerTick;


  /*
   * ----------------------------------------------------------
   * IDLE TIME
   * ----------------------------------------------------------
   */

  if (state === STATES.IDLE) {
    machine.idleTime +=
      simulationIntervalSeconds / 60;
  }


  /*
   * ----------------------------------------------------------
   * LOAD CYCLES
   * ----------------------------------------------------------
   */

  if (
    state === STATES.LOADING &&
    machine.stateTicks === 1
  ) {
    machine.loadCycles += 1;
  }
}


/*
 * ============================================================
 * CREATE TELEMETRY PAYLOAD
 *
 * Keep this restricted to the fields used
 * by the ETA model.
 * ============================================================
 */

function createEtaPayload(machine) {
  return {
    machineId:
      machine.machineId,

    state:
      machine.state,

    scenario:
      machine.scenario,

    engineHours:
      round(machine.engineHours, 2),

    fuelLevelLitres:
      round(machine.fuelLevelLitres, 2),

    fuelConsumptionRateLph:
      round(
        machine.fuelConsumptionRateLph,
        2
      ),

    loadCycles:
      machine.loadCycles,

    idleTime:
      round(machine.idleTime, 2),

    engineRpm:
      Math.round(machine.engineRpm),

    engineTemperature:
      round(
        machine.engineTemperature,
        1
      ),

    hydraulicTemperature:
      round(
        machine.hydraulicTemperature,
        1
      ),

    vibration:
      round(machine.vibration, 2),

    seatbeltStatus:
      machine.seatbeltStatus,
  };
}


/*
 * ============================================================
 * GENERATE SCENARIO
 *
 * Normal is intentionally much more common.
 * ============================================================
 */

function generateScenario() {
  const roll = random();

  if (roll < 0.78) {
    return SCENARIOS.NORMAL;
  }

  return randomChoice(
    ABNORMAL_SCENARIOS
  );
}


/*
 * ============================================================
 * ETA GROUND TRUTH
 *
 * IMPORTANT:
 *
 * This is the synthetic target used to train
 * the ML model.
 *
 * It is NOT part of the live simulator.
 *
 * The input values come from the simulator-
 * aligned telemetry logic above.
 * ============================================================
 */

/*
 * ============================================================
 * ETA GROUND TRUTH
 *
 * IMPORTANT:
 *
 * This is the synthetic target used to train
 * the ML model.
 *
 * It is NOT part of the live simulator.
 *
 * The input values come from the simulator-
 * aligned telemetry logic above.
 * ============================================================
 */

function calculateEta(payload) {
  // Base ETA
  let eta = 12;

  /*
   * ----------------------------------------------------------
   * CURRENT MACHINE STATE
   * ----------------------------------------------------------
   */

  const stateEffect = {
    IDLE: 10,
    STARTING: 7,
    OPERATING: 4,
    LOADING: 0,
    TRANSPORTING: 3,
    UNLOADING: 5,
  };

  eta += stateEffect[payload.state] || 0;

  /*
   * ----------------------------------------------------------
   * WORKLOAD
   *
   * loadCycles is cumulative, so use a small coefficient.
   * ----------------------------------------------------------
   */

  eta += payload.loadCycles * 0.025;

  /*
   * ----------------------------------------------------------
   * ENGINE UTILIZATION
   * ----------------------------------------------------------
   */

  eta +=
    Math.max(
      0,
      payload.engineRpm - 1200
    ) * 0.002;

  /*
   * ----------------------------------------------------------
   * FUEL CONSUMPTION
   * ----------------------------------------------------------
   */

  eta +=
    payload.fuelConsumptionRateLph * 0.20;

  /*
   * ----------------------------------------------------------
   * IDLE TIME
   *
   * idleTime is cumulative simulator telemetry,
   * so the coefficient must be much smaller.
   * ----------------------------------------------------------
   */

  eta +=
    payload.idleTime * 0.05;

  /*
   * ----------------------------------------------------------
   * ENGINE AGE
   * ----------------------------------------------------------
   */

  eta +=
    Math.max(
      0,
      payload.engineHours - 1000
    ) * 0.001;

  /*
   * ----------------------------------------------------------
   * LOW FUEL
   * ----------------------------------------------------------
   */

  if (
    payload.fuelLevelLitres < 100
  ) {
    eta +=
      (100 -
        payload.fuelLevelLitres) *
      0.04;
  }

  /*
   * ----------------------------------------------------------
   * ENGINE TEMPERATURE
   * ----------------------------------------------------------
   */

  if (
    payload.engineTemperature > 90
  ) {
    eta +=
      (payload.engineTemperature - 90) *
      0.25;
  }

  /*
   * ----------------------------------------------------------
   * HYDRAULIC TEMPERATURE
   * ----------------------------------------------------------
   */

  if (
    payload.hydraulicTemperature > 82
  ) {
    eta +=
      (payload.hydraulicTemperature - 82) *
      0.20;
  }

  /*
   * ----------------------------------------------------------
   * VIBRATION
   * ----------------------------------------------------------
   */

  if (
    payload.vibration > 0.6
  ) {
    eta +=
      (payload.vibration - 0.6) *
      5;
  }

  /*
   * ----------------------------------------------------------
   * SCENARIO
   * ----------------------------------------------------------
   */

  const scenarioEffect = {
    NORMAL: 0,

    SEATBELT_VIOLATION: 2,

    EXCESSIVE_IDLE: 5,

    OVERHEATING: 7,

    HIGH_VIBRATION: 6,

    PROXIMITY_HAZARD: 4,

    ABNORMAL_FUEL_CONSUMPTION: 5,
  };

  eta +=
    scenarioEffect[
      payload.scenario
    ] || 0;

  /*
   * ----------------------------------------------------------
   * SEATBELT
   * ----------------------------------------------------------
   */

  if (
    payload.seatbeltStatus === false
  ) {
    eta += 1.5;
  }

  /*
   * ----------------------------------------------------------
   * RANDOM NOISE
   * ----------------------------------------------------------
   */

  eta += randomNormal(
    0,
    2.0
  );

  /*
   * ----------------------------------------------------------
   * FINAL BOUNDS
   * ----------------------------------------------------------
   */

  eta = clamp(
    eta,
    3,
    90
  );

  return round(
    eta,
    2
  );
}

function generateSample(
  machines
) {
  const machine =
    randomChoice(machines);


  /*
   * Advance machine through the same
   * state/telemetry lifecycle used by
   * the simulator.
   */

  updateMachineState(
    machine
  );


  /*
   * Apply scenario before telemetry
   * update, matching simulator ordering.
   */

  machine.scenario =
    generateScenario();

  applyScenario(machine);


  /*
   * Update telemetry using 4-second
   * simulated time.
   */

  updateTelemetry(
    machine,
    INTERVAL_MS
  );


  /*
   * Keep seatbelt behavior consistent.
   */

  updateSeatbelt(machine);


  /*
   * Build the ETA feature payload.
   */

  const payload =
    createEtaPayload(machine);


  /*
   * Generate training target.
   */

  payload.eta_minutes =
    calculateEta(payload);


  return payload;
}


/*
 * ============================================================
 * CSV HELPERS
 * ============================================================
 */

function escapeCsvValue(value) {
  const stringValue =
    String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(
      /"/g,
      '""'
    )}"`;
  }

  return stringValue;
}


function convertToCsv(rows) {
  if (rows.length === 0) {
    return "";
  }

  const headers =
    Object.keys(rows[0]);

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) =>
          escapeCsvValue(
            row[header]
          )
        )
        .join(",")
    ),
  ];

  return lines.join("\n");
}


/*
 * ============================================================
 * SHUFFLE
 * ============================================================
 */

function shuffle(array) {
  for (
    let i = array.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      random() * (i + 1)
    );

    [
      array[i],
      array[j],
    ] = [
      array[j],
      array[i],
    ];
  }

  return array;
}


/*
 * ============================================================
 * GENERATE DATASET
 * ============================================================
 */

console.log(
  "Generating simulator-aligned ETA dataset...\n"
);


/*
 * Create three independent machine
 * instances, matching the simulator.
 */

const machines =
  AVAILABLE_MACHINES.map(
    (machineId) =>
      createMachine(machineId)
  );


const dataset = [];


for (
  let i = 0;
  i < TOTAL_SAMPLES;
  i++
) {
  dataset.push(
    generateSample(machines)
  );
}


shuffle(dataset);


/*
 * ============================================================
 * TRAIN / VALIDATION / TEST SPLIT
 * ============================================================
 */

const trainSize =
  Math.floor(
    TOTAL_SAMPLES *
    TRAIN_RATIO
  );

const validationSize =
  Math.floor(
    TOTAL_SAMPLES *
    VALIDATION_RATIO
  );


const train =
  dataset.slice(
    0,
    trainSize
  );

const validation =
  dataset.slice(
    trainSize,
    trainSize +
      validationSize
  );

const test =
  dataset.slice(
    trainSize +
      validationSize
  );


/*
 * ============================================================
 * WRITE FILES
 * ============================================================
 */

const outputDirectory =
  __dirname;


const trainPath =
  path.join(
    outputDirectory,
    "train.csv"
  );

const validationPath =
  path.join(
    outputDirectory,
    "validation.csv"
  );

const testPath =
  path.join(
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


/*
 * ============================================================
 * SUMMARY
 * ============================================================
 */

console.log(
  "ETA dataset generated successfully.\n"
);

console.log(
  `Total samples:      ${dataset.length}`
);

console.log(
  `Training samples:   ${train.length}`
);

console.log(
  `Validation samples: ${validation.length}`
);

console.log(
  `Test samples:       ${test.length}`
);

console.log("\nGenerated files:");

console.log(
  `  ${trainPath}`
);

console.log(
  `  ${validationPath}`
);

console.log(
  `  ${testPath}`
);