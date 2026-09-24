const fs = require("fs");
const path = require("path");

// ============================================================
// Configuration
// ============================================================

const DATA_DIR = path.join(
  __dirname,
  "data"
);

const TRAIN_PATH = path.join(
  DATA_DIR,
  "train.csv"
);

const VALIDATION_PATH = path.join(
  DATA_DIR,
  "validation.csv"
);

const TEST_PATH = path.join(
  DATA_DIR,
  "test.csv"
);

// ============================================================
// CSV parser
// ============================================================

function parseCsv(filePath) {
  const content = fs.readFileSync(
    filePath,
    "utf8"
  ).trim();

  const lines = content.split("\n");

  const headers = lines[0]
    .split(",")
    .map((header) => header.trim());

  const rows = lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");

      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      return row;
    });

  return {
    headers,
    rows,
  };
}

// ============================================================
// Numeric columns
// ============================================================

const NUMERIC_COLUMNS = [
  "engineHours",
  "fuelLevelLitres",
  "fuelConsumptionRateLph",
  "loadCycles",
  "idleTime",
  "engineRpm",
  "engineTemperature",
  "hydraulicTemperature",
  "vibration",
  "eta_minutes",
];

// ============================================================
// Categorical columns
// ============================================================

const CATEGORICAL_COLUMNS = [
  "machineId",
  "state",
  "scenario",
  "seatbeltStatus",
];

// ============================================================
// Statistics
// ============================================================

function calculateStatistics(rows, column) {
  const values = rows
    .map((row) => Number(row[column]))
    .filter((value) => !Number.isNaN(value));

  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const sum = values.reduce(
    (total, value) => total + value,
    0
  );

  const mean = sum / values.length;

  const variance =
    values.reduce(
      (total, value) =>
        total + (value - mean) ** 2,
      0
    ) / values.length;

  const standardDeviation =
    Math.sqrt(variance);

  const percentile = (p) => {
    const index =
      (sorted.length - 1) * p;

    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sorted[lower];
    }

    return (
      sorted[lower] +
      (sorted[upper] - sorted[lower]) *
        (index - lower)
    );
  };

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    standardDeviation,
    p25: percentile(0.25),
    median: percentile(0.50),
    p75: percentile(0.75),
  };
}

// ============================================================
// Unique categorical values
// ============================================================

function getUniqueValues(rows, column) {
  return [
    ...new Set(
      rows.map((row) => row[column])
    ),
  ].sort();
}

// ============================================================
// Missing value analysis
// ============================================================

function countMissingValues(rows, headers) {
  const missing = {};

  for (const header of headers) {
    missing[header] = 0;

    for (const row of rows) {
      if (
        row[header] === undefined ||
        row[header] === null ||
        row[header].trim() === ""
      ) {
        missing[header]++;
      }
    }
  }

  return missing;
}

// ============================================================
// Correlation
// ============================================================

function calculateCorrelation(
  rows,
  columnA,
  columnB
) {
  const pairs = rows
    .map((row) => ({
      a: Number(row[columnA]),
      b: Number(row[columnB]),
    }))
    .filter(
      ({ a, b }) =>
        !Number.isNaN(a) &&
        !Number.isNaN(b)
    );

  if (pairs.length === 0) {
    return null;
  }

  const meanA =
    pairs.reduce(
      (sum, pair) => sum + pair.a,
      0
    ) / pairs.length;

  const meanB =
    pairs.reduce(
      (sum, pair) => sum + pair.b,
      0
    ) / pairs.length;

  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;

  for (const pair of pairs) {
    const differenceA =
      pair.a - meanA;

    const differenceB =
      pair.b - meanB;

    numerator +=
      differenceA * differenceB;

    denominatorA +=
      differenceA ** 2;

    denominatorB +=
      differenceB ** 2;
  }

  const denominator =
    Math.sqrt(
      denominatorA * denominatorB
    );

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

// ============================================================
// Main analysis
// ============================================================

console.log(
  "========================================"
);

console.log(
  "ETA DATASET ANALYSIS"
);

console.log(
  "========================================\n"
);

const train = parseCsv(TRAIN_PATH);
const validation = parseCsv(
  VALIDATION_PATH
);
const test = parseCsv(TEST_PATH);

console.log("Dataset sizes:");

console.log(
  `Training:   ${train.rows.length}`
);

console.log(
  `Validation: ${validation.rows.length}`
);

console.log(
  `Test:       ${test.rows.length}`
);

console.log(
  `Total:      ${
    train.rows.length +
    validation.rows.length +
    test.rows.length
  }\n`
);

// ============================================================
// Schema
// ============================================================

console.log(
  "========================================"
);

console.log("SCHEMA");

console.log(
  "========================================\n"
);

console.log(
  train.headers.join(", ")
);

console.log();

// ============================================================
// Missing values
// ============================================================

console.log(
  "========================================"
);

console.log("MISSING VALUES");

console.log(
  "========================================\n"
);

const missing =
  countMissingValues(
    train.rows,
    train.headers
  );

for (const [column, count] of Object.entries(
  missing
)) {
  console.log(
    `${column.padEnd(30)} ${count}`
  );
}

console.log();

// ============================================================
// Numerical statistics
// ============================================================

console.log(
  "========================================"
);

console.log("NUMERICAL FEATURES");

console.log(
  "========================================\n"
);

for (const column of NUMERIC_COLUMNS) {
  const stats =
    calculateStatistics(
      train.rows,
      column
    );

  console.log(`\n${column}`);

  console.log(
    `  min:    ${stats.min.toFixed(2)}`
  );

  console.log(
    `  max:    ${stats.max.toFixed(2)}`
  );

  console.log(
    `  mean:   ${stats.mean.toFixed(2)}`
  );

  console.log(
    `  std:    ${stats.standardDeviation.toFixed(
      2
    )}`
  );

  console.log(
    `  p25:    ${stats.p25.toFixed(2)}`
  );

  console.log(
    `  median: ${stats.median.toFixed(2)}`
  );

  console.log(
    `  p75:    ${stats.p75.toFixed(2)}`
  );
}

console.log();

// ============================================================
// Categorical values
// ============================================================

console.log(
  "========================================"
);

console.log("CATEGORICAL FEATURES");

console.log(
  "========================================\n"
);

for (const column of CATEGORICAL_COLUMNS) {
  const values =
    getUniqueValues(
      train.rows,
      column
    );

  console.log(
    `${column}: ${values.join(", ")}`
  );
}

console.log();

// ============================================================
// Correlation with ETA
// ============================================================

console.log(
  "========================================"
);

console.log(
  "CORRELATION WITH ETA"
);

console.log(
  "========================================\n"
);

const correlations = NUMERIC_COLUMNS
  .filter(
    (column) =>
      column !== "eta_minutes"
  )
  .map((column) => ({
    column,
    correlation:
      calculateCorrelation(
        train.rows,
        column,
        "eta_minutes"
      ),
  }))
  .sort(
    (a, b) =>
      Math.abs(b.correlation) -
      Math.abs(a.correlation)
  );

for (const item of correlations) {
  console.log(
    `${item.column.padEnd(
      30
    )} ${item.correlation.toFixed(4)}`
  );
}

console.log();

// ============================================================
// ETA distribution
// ============================================================

console.log(
  "========================================"
);

console.log("ETA DISTRIBUTION");

console.log(
  "========================================\n"
);

const etaStats =
  calculateStatistics(
    train.rows,
    "eta_minutes"
  );

console.log(
  `Minimum ETA: ${etaStats.min.toFixed(2)} minutes`
);

console.log(
  `Maximum ETA: ${etaStats.max.toFixed(2)} minutes`
);

console.log(
  `Mean ETA:    ${etaStats.mean.toFixed(2)} minutes`
);

console.log(
  `Median ETA:  ${etaStats.median.toFixed(2)} minutes`
);

console.log(
  `Std Dev:     ${etaStats.standardDeviation.toFixed(
    2
  )} minutes`
);

console.log(
  "\nAnalysis complete."
);