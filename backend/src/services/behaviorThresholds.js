// Operator Behavior Engine — Configurable Thresholds
// Every number that affects a skill score lives here.
// No magic numbers in the engine itself.

const SKILL_IDS = ['IDLE_MANAGEMENT', 'FUEL_EFFICIENCY', 'SMOOTH_OPERATION', 'SAFETY_AWARENESS', 'TASK_EXECUTION'];

const LABELS = {
  GOOD: { min: 80, label: 'GOOD' },
  DEVELOPING: { min: 60, label: 'DEVELOPING' },
  NEEDS_ATTENTION: { min: 40, label: 'NEEDS_ATTENTION' },
  CRITICAL: { min: 0, label: 'CRITICAL' },
};

function labelFor(score) {
  if (score >= LABELS.GOOD.min) return LABELS.GOOD.label;
  if (score >= LABELS.DEVELOPING.min) return LABELS.DEVELOPING.label;
  if (score >= LABELS.NEEDS_ATTENTION.min) return LABELS.NEEDS_ATTENTION.label;
  return LABELS.CRITICAL.label;
}

const config = require('../config/env');

// EMA decay factor for baseline updates.
const BASELINE_ALPHA = 0.2;
// Accelerated alpha after verified training improvement.
const BASELINE_ALPHA_FAST = 0.5;
// Minimum completed shifts before establishing a baseline.
const MIN_SHIFTS_FOR_BASELINE = config.behaviorMinShifts || 3;
// Recent shifts window for scoring.
const SCORING_WINDOW = config.behaviorWindowShifts || 5;
// Maximum observations kept in the ledger.
const MAX_OBSERVATIONS = 30;
// Minimum active task minutes for a shift to count.
const MIN_ACTIVE_MINUTES = 10;
// Post-training evaluation window in days.
const POST_TRAINING_DAYS = config.behaviorRetrainDays || 14;
// Minimum shifts after training before evaluating improvement.
const MIN_SHIFTS_AFTER_TRAINING = 3;
// Score improvement threshold to consider training successful.
const TRAINING_SUCCESS_DELTA = 10;

// Recommendation thresholds.
const RECOMMEND_SCORE_THRESHOLD = 55;
// Consecutive declining shifts to trigger a trend recommendation.
const RECOMMEND_TREND_SHIFTS = 3;
// Repeated safety ruleId across N of last M shifts.
const RECOMMEND_SAFETY_REPEAT_N = 3;
const RECOMMEND_SAFETY_REPEAT_M = 5;
// Suppress re-recommendation for this many days after passing a module.
const RECOMMEND_SUPPRESS_DAYS = 14;

// Context relaxation factors (multiply the threshold by this when the condition applies).
const CONTEXT_RELAX = {
  RAIN: 1.3,
  LOW_VISIBILITY: 1.2,
  HIGH_AMBIENT_TEMP: 1.2,    // ambientTempC > 38
  HIGH_AMBIENT_THRESHOLD: 38,
};

// Per-skill metric configurations.
// Each metric has: threshold (value above baseline that starts penalty),
// weight (max points deducted), cap (hard limit on deduction for this metric).
const SKILLS = {
  IDLE_MANAGEMENT: {
    metrics: {
      idleRatio: { threshold: 0.15, weight: 60, cap: 45 },
      unjustifiedIdleRatio: { threshold: 0.10, weight: 40, cap: 35 },
    },
    // Below this idle ratio, award a bonus.
    bonusThreshold: 0.08,
    bonusPoints: 5,
  },
  FUEL_EFFICIENCY: {
    metrics: {
      fuelPerCycleRatio: { threshold: 0.20, weight: 50, cap: 40 },
      idleFuelRatio: { threshold: 0.25, weight: 30, cap: 25 },
    },
  },
  SMOOTH_OPERATION: {
    metrics: {
      rpmVarianceRatio: { threshold: 0.30, weight: 35, cap: 30 },
      vibrationRatio: { threshold: 0.15, weight: 35, cap: 30 },
      impactRate: { threshold: 0, weight: 20, cap: 20 }, // any impact is penalised
    },
  },
  SAFETY_AWARENESS: {
    metrics: {
      safetyEventsPerHour: { threshold: 0.5, weight: 40, cap: 35 },
      seatbeltViolations: { threshold: 0, weight: 30, cap: 25 },
      proximityEvents: { threshold: 1, weight: 20, cap: 20 },
    },
  },
  TASK_EXECUTION: {
    metrics: {
      taskTimeOverrun: { threshold: 0.20, weight: 40, cap: 30 },
      taskCompletionRate: { threshold: 0, weight: 30, cap: 25 }, // penalty for incomplete tasks
      cycleRateVariance: { threshold: 0.25, weight: 20, cap: 15 },
    },
  },
};

// Map skill areas to training modules.
const SKILL_TO_MODULE = {
  IDLE_MANAGEMENT: 'SIM_SHUTDOWN',
  FUEL_EFFICIENCY: 'SIM_SHUTDOWN',
  SMOOTH_OPERATION: 'SIM_OVERHEAT',  // closest existing module
  SAFETY_AWARENESS: 'SIM_PROXIMITY_RAIN',
  TASK_EXECUTION: 'SIM_STARTUP',     // closest existing module
};

module.exports = {
  SKILL_IDS,
  LABELS,
  labelFor,
  BASELINE_ALPHA,
  BASELINE_ALPHA_FAST,
  MIN_SHIFTS_FOR_BASELINE,
  SCORING_WINDOW,
  MAX_OBSERVATIONS,
  MIN_ACTIVE_MINUTES,
  POST_TRAINING_DAYS,
  MIN_SHIFTS_AFTER_TRAINING,
  TRAINING_SUCCESS_DELTA,
  RECOMMEND_SCORE_THRESHOLD,
  RECOMMEND_TREND_SHIFTS,
  RECOMMEND_SAFETY_REPEAT_N,
  RECOMMEND_SAFETY_REPEAT_M,
  RECOMMEND_SUPPRESS_DAYS,
  CONTEXT_RELAX,
  SKILLS,
  SKILL_TO_MODULE,
};
