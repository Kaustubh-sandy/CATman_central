// Demo history for the operator skill engine (OP1001).
//
// These are synthetic past shifts, but no score is typed in: every shift is fed
// through behaviorEngine.ingestObservation() and the training through
// onTrainingComplete(), so skills, trends, recommendations and the training result
// shown on the Skills page are all calculated by the engine.
//
// Storyline (days before the backend first seeds):
//   14–10  safety habits weak: proximity breaches, one seatbelt alert
//    9     passes the "Worker in swing radius — rain" simulation
//    8–6   safer shifts (the engine measures the improvement)
//    5–1   idling creeps up, burning more fuel while idle

const repo = require('./repo');

const OPERATOR_ID = 'OP1001';
const SEED_VERSION = 3;
const SEED_SHIFT_PREFIX = 'SEED-';
const LEGACY_SEED_PREFIX = 'SHIFT_PREV_';
const TRAINING = { moduleId: 'SIM_PROXIMITY_RAIN', daysAgo: 9, score: 88, maxScore: 100 };

const DAY_MS = 24 * 60 * 60 * 1000;

// One row per shift: [daysAgo, weather, idleRatio, unjustifiedIdle, fuelPerCycle, idleFuelRatio,
//   vibrationRatio, safetyEventsPerHour, seatbeltViolations, proximityEvents, taskTimeOverrun, safetyRules]
const SHIFTS = [
  [14, 'CLEAR', 0.14, 0.06, 1.40, 0.14, 0.10, 0.75, 0, 2, 0.06, ['PROXIMITY_WARNING', 'PROXIMITY_CRITICAL']],
  [13, 'CLEAR', 0.15, 0.07, 1.42, 0.15, 0.11, 0.75, 0, 2, 0.05, ['PROXIMITY_WARNING']],
  [12, 'RAIN', 0.16, 0.07, 1.45, 0.15, 0.12, 1.00, 1, 2, 0.08, ['PROXIMITY_WARNING', 'SEATBELT_VIOLATION']],
  [11, 'CLEAR', 0.14, 0.06, 1.41, 0.14, 0.10, 1.00, 0, 3, 0.05, ['PROXIMITY_WARNING', 'PROXIMITY_CRITICAL']],
  [10, 'CLEAR', 0.15, 0.07, 1.43, 0.15, 0.11, 1.25, 1, 3, 0.06, ['PROXIMITY_WARNING', 'PROXIMITY_CRITICAL', 'SEATBELT_VIOLATION']],
  [8, 'CLEAR', 0.15, 0.07, 1.42, 0.15, 0.12, 0.50, 0, 1, 0.05, ['PROXIMITY_WARNING']],
  [7, 'CLEAR', 0.16, 0.08, 1.44, 0.16, 0.13, 0.75, 0, 2, 0.06, ['PROXIMITY_WARNING']],
  [6, 'CLEAR', 0.16, 0.08, 1.43, 0.16, 0.12, 0.50, 0, 1, 0.05, ['PROXIMITY_WARNING']],
  [5, 'CLEAR', 0.22, 0.13, 1.62, 0.26, 0.16, 0.50, 0, 1, 0.12, ['PROXIMITY_WARNING']],
  [4, 'CLEAR', 0.27, 0.17, 1.74, 0.32, 0.18, 0.75, 0, 2, 0.18, ['PROXIMITY_WARNING']],
  [3, 'RAIN', 0.31, 0.20, 1.82, 0.36, 0.19, 0.50, 0, 1, 0.26, ['PROXIMITY_WARNING']],
  [2, 'CLEAR', 0.33, 0.22, 1.88, 0.40, 0.18, 0.75, 0, 1, 0.24, ['PROXIMITY_WARNING']],
  [1, 'CLEAR', 0.35, 0.24, 1.95, 0.42, 0.19, 0.50, 0, 1, 0.27, ['PROXIMITY_WARNING']],
];

function observationFor(row, nowMs) {
  const [daysAgo, weather, idleRatio, unjustifiedIdleRatio, fuelPerCycle, idleFuelRatio, vibrationRatio,
    safetyEventsPerHour, seatbeltViolations, proximityEvents, taskTimeOverrun, safetyRuleIds] = row;
  const at = new Date(nowMs - daysAgo * DAY_MS);
  const activeMinutes = 240;
  return {
    shiftId: `${SEED_SHIFT_PREFIX}${OPERATOR_ID}-D${daysAgo}`,
    date: at.toISOString().slice(0, 10),
    at: at.toISOString(),
    activeMinutes,
    seeded: true,
    context: {
      weather,
      visibility: weather === 'RAIN' ? 'LOW' : 'GOOD',
      ambientTempC: 31,
      taskTypes: ['EXCAVATION', 'LOADING'],
      taskCount: 3,
      completedTaskCount: 3,
    },
    metrics: {
      idleRatio,
      unjustifiedIdleRatio,
      unjustifiedIdleMin: Number((unjustifiedIdleRatio * activeMinutes).toFixed(1)),
      fuelPerCycle,
      idleFuelRatio,
      rpmVariance: 180,
      vibrationRatio,
      throttleChopRate: 0,
      taskTimeOverrun,
      taskCompletionRate: 1,
      cycleRateVariance: 0.1,
      safetyEventsPerHour,
      seatbeltViolations,
      proximityEvents,
      impactRate: 0,
    },
    safetyRuleIds,
  };
}

// A ledger we may replace: missing, the old hard-coded seed, or an older version of
// this seed — and never one that contains a real shift.
function isReplaceable(ledger) {
  if (!ledger) return true;
  if (ledger.seedVersion === SEED_VERSION) return false;
  const obs = ledger.observations || [];
  return obs.every((o) => String(o.shiftId || '').startsWith(LEGACY_SEED_PREFIX) || String(o.shiftId || '').startsWith(SEED_SHIFT_PREFIX));
}

function seedBehaviorHistory({ reset = false } = {}) {
  const existing = repo.get('behaviorLedger', OPERATOR_ID);
  if (!reset && !isReplaceable(existing)) return false;

  // Lazy require: the engine pulls in socket/telemetry modules not needed for plain seeding.
  const engine = require('../services/behaviorEngine.service');
  const nowMs = Date.now();
  const trainingAt = new Date(nowMs - TRAINING.daysAgo * DAY_MS).toISOString();

  repo.put('behaviorLedger', OPERATOR_ID, { id: OPERATOR_ID, observations: [], baseline: null, skills: null, postTrainingWindows: [] });

  SHIFTS.forEach((row) => {
    if (row[0] < TRAINING.daysAgo && !repo.get('behaviorLedger', OPERATOR_ID).postTrainingWindows.length) {
      engine.onTrainingComplete(OPERATOR_ID, TRAINING.moduleId, {
        score: TRAINING.score,
        maxScore: TRAINING.maxScore,
        passed: true,
        at: trainingAt,
      });
    }
    engine.ingestObservation(OPERATOR_ID, observationFor(row, nowMs));
  });

  repo.patch('behaviorLedger', OPERATOR_ID, { seedVersion: SEED_VERSION, seededAt: new Date(nowMs).toISOString() });

  // The matching simulation attempt, so E-Learning and the 14-day "don't recommend again"
  // rule agree with the history. No XP: it was not earned in this app.
  const attemptId = `${OPERATOR_ID}-${TRAINING.moduleId}-seed`;
  if (!repo.get('trainingProgress', attemptId)) {
    repo.put('trainingProgress', attemptId, {
      operatorId: OPERATOR_ID,
      moduleId: TRAINING.moduleId,
      skill: 'PROXIMITY_AWARENESS',
      score: TRAINING.score,
      maxScore: TRAINING.maxScore,
      passed: true,
      outcome: 'PASS',
      violations: [],
      hintsUsed: 0,
      xpPotential: 0,
      xpAwarded: 0,
      seeded: true,
      completedAt: trainingAt,
    });
  }
  return true;
}

module.exports = { seedBehaviorHistory, OPERATOR_ID, SEED_VERSION };
