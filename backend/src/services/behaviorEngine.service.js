// Operator Behavior Engine — Core Service
//
// Observes operator behavior across shifts, maintains per-operator baselines,
// computes 5 skill scores (0–100), and generates personalized training
// recommendations with a closed training → improvement → re-evaluation loop.
//
// Deterministic. Explainable. No ML. Every score traceable to specific metrics.

const repo = require('../db/repo');
const telemetryStore = require('./telemetryStore.service');
const { emit } = require('../socket/socket');
const T = require('./behaviorThresholds');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round(v, digits = 2) {
  return Number(Number(v).toFixed(digits));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function getLedger(operatorId) {
  return repo.get('behaviorLedger', operatorId) || {
    id: operatorId,
    observations: [],
    baseline: null,
    skills: null,
    postTrainingWindows: [],
  };
}

function saveLedger(ledger) {
  return repo.put('behaviorLedger', ledger.id, ledger);
}

// ─── Telemetry snapshot at shift end ────────────────────────────────────

function computeTelemetryMetrics(machineId) {
  const history = telemetryStore.getHistory(machineId);
  if (!history.length) return { rpmVariance: 0, vibrationRatio: 0, throttleChopRate: 0 };

  const operatingFrames = history.filter(
    (t) => ['OPERATING', 'LOADING', 'UNLOADING', 'TRANSPORTING'].includes(t.state)
  );

  // RPM variance during work.
  const rpms = operatingFrames.map((t) => t.engineRpm).filter((v) => typeof v === 'number');
  const rpmVariance = stddev(rpms);

  // Vibration time ratio (fraction of operating time above 0.6 g).
  const vibAbove = operatingFrames.filter((t) => (t.vibration || 0) > 0.6).length;
  const vibrationRatio = operatingFrames.length ? vibAbove / operatingFrames.length : 0;

  // Throttle chop: count sign changes in throttle delta per minute.
  const throttles = operatingFrames
    .map((t) => t.throttlePosition)
    .filter((v) => typeof v === 'number');
  let chops = 0;
  for (let i = 2; i < throttles.length; i++) {
    const d1 = throttles[i - 1] - throttles[i - 2];
    const d2 = throttles[i] - throttles[i - 1];
    if (d1 * d2 < -0.01) chops++;
  }
  const spanMin = operatingFrames.length * 4 / 60; // ~4s per frame
  const throttleChopRate = spanMin > 0.5 ? chops / spanMin : 0;

  return {
    rpmVariance: round(rpmVariance),
    vibrationRatio: round(vibrationRatio),
    throttleChopRate: round(throttleChopRate),
  };
}

// ─── Build observation from shift ───────────────────────────────────────

function buildObservation(operatorId, summary, shift) {
  const durationMin = summary.durationMin || 1;
  const durationH = durationMin / 60;
  const telemetryMetrics = computeTelemetryMetrics(shift.machineId);

  // Task results for this shift.
  const tasks = repo
    .list('tasks', (t) =>
      t.operatorId === operatorId &&
      ['COMPLETED', 'INCOMPLETE'].includes(t.status) &&
      t.completedAt && t.completedAt >= (shift.startedAt || shift.createdAt)
    );

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const totalCycles = completedTasks.reduce((s, t) => s + (t.result?.cyclesDone || 0), 0);
  const totalTaskFuel = completedTasks.reduce((s, t) => s + (t.result?.fuelUsedL || 0), 0);
  const totalTaskIdle = completedTasks.reduce((s, t) => s + (t.result?.idleMin || 0), 0);

  // Idle ratio.
  const idleRatio = durationMin > 0 ? (summary.idleMinutes || 0) / durationMin : 0;

  // Unjustified idle: total idle minus task-paused time (approximation).
  // Tasks record their own idleMin, which includes paused time during the task.
  // Unjustified = shift idle - sum of task idle (the remainder is between-task or no-reason idle).
  const justifiedIdleMin = totalTaskIdle;
  const unjustifiedIdleMin = Math.max(0, (summary.idleMinutes || 0) - justifiedIdleMin);
  const unjustifiedIdleRatio = durationMin > 0 ? unjustifiedIdleMin / durationMin : 0;

  // Fuel per cycle.
  const fuelPerCycle = totalCycles > 0 ? totalTaskFuel / totalCycles : 0;

  // Idle fuel ratio: fraction of fuel burned while idle (approximation: 4 L/h idle burn).
  const estimatedIdleFuelL = (summary.idleMinutes || 0) / 60 * 4;
  const idleFuelRatio = summary.fuelUsedL > 0 ? Math.min(1, estimatedIdleFuelL / summary.fuelUsedL) : 0;

  // Task time ratio: actual / planned (averaged).
  const taskTimeRatios = completedTasks
    .filter((t) => t.result?.predictedMin > 0)
    .map((t) => t.result.actualMin / t.result.predictedMin);
  const taskTimeOverrun = taskTimeRatios.length
    ? mean(taskTimeRatios) - 1 // >0 means overrun
    : 0;

  // Task completion rate.
  const taskCompletionRate = tasks.length > 0 ? completedTasks.length / tasks.length : 1;

  // Cycle rate variance.
  const cycleRates = completedTasks
    .filter((t) => t.result?.actualMin > 0)
    .map((t) => (t.result.cyclesDone || 0) / t.result.actualMin);
  const cycleRateVariance = cycleRates.length >= 2
    ? stddev(cycleRates) / (mean(cycleRates) || 1) // coefficient of variation
    : 0;

  // Safety events.
  const since = shift.startedAt || shift.createdAt;
  const alerts = repo.list(
    'alerts',
    (a) => a.operatorId === operatorId && a.machineId === shift.machineId && a.detectedAt >= since
  );
  const safetyEventsPerHour = durationH > 0 ? alerts.length / durationH : 0;
  const seatbeltViolations = alerts.filter((a) => a.ruleId === 'SEATBELT_VIOLATION').length;
  const proximityEvents = alerts.filter(
    (a) => a.ruleId === 'PROXIMITY_CRITICAL' || a.ruleId === 'PROXIMITY_WARNING'
  ).length;
  const impactEvents = alerts.filter((a) => a.ruleId === 'IMPACT').length;
  const impactRate = durationH > 0 ? impactEvents / durationH : 0;

  // Site context.
  const siteService = require('./site.service');
  const site = siteService.get();

  return {
    shiftId: shift.id,
    date: shift.date,
    at: new Date().toISOString(),
    activeMinutes: round(durationMin, 1),
    context: {
      weather: site.weather || 'CLEAR',
      visibility: site.visibility || 'GOOD',
      ambientTempC: site.ambientTempC || null,
      taskTypes: [...new Set(completedTasks.map((t) => t.type).filter(Boolean))],
      taskCount: tasks.length,
      completedTaskCount: completedTasks.length,
    },
    metrics: {
      idleRatio: round(idleRatio),
      unjustifiedIdleRatio: round(unjustifiedIdleRatio),
      unjustifiedIdleMin: round(unjustifiedIdleMin, 1),
      fuelPerCycle: round(fuelPerCycle),
      idleFuelRatio: round(idleFuelRatio),
      rpmVariance: telemetryMetrics.rpmVariance,
      vibrationRatio: telemetryMetrics.vibrationRatio,
      throttleChopRate: telemetryMetrics.throttleChopRate,
      taskTimeOverrun: round(taskTimeOverrun),
      taskCompletionRate: round(taskCompletionRate),
      cycleRateVariance: round(cycleRateVariance),
      safetyEventsPerHour: round(safetyEventsPerHour),
      seatbeltViolations,
      proximityEvents,
      impactRate: round(impactRate),
    },
    safetyRuleIds: [...new Set(alerts.map((a) => a.ruleId))],
  };
}

// ─── Baseline management ────────────────────────────────────────────────

const BASELINE_KEYS = [
  'idleRatio', 'unjustifiedIdleRatio', 'fuelPerCycle', 'idleFuelRatio',
  'rpmVariance', 'vibrationRatio', 'taskTimeOverrun', 'safetyEventsPerHour',
  'impactRate', 'taskCompletionRate', 'cycleRateVariance',
];

function establishBaseline(observations) {
  const baseline = {};
  BASELINE_KEYS.forEach((key) => {
    const values = observations.map((o) => o.metrics[key]).filter((v) => typeof v === 'number');
    baseline[key] = values.length ? round(mean(values)) : 0;
  });
  baseline.establishedAt = new Date().toISOString();
  baseline.shiftCount = observations.length;
  return baseline;
}

function updateBaseline(existing, observation, alpha = T.BASELINE_ALPHA) {
  const updated = { ...existing };
  BASELINE_KEYS.forEach((key) => {
    const v = observation.metrics[key];
    if (typeof v !== 'number') return;
    const prev = existing[key] || 0;
    updated[key] = round(alpha * v + (1 - alpha) * prev);
  });
  updated.shiftCount = (existing.shiftCount || 0) + 1;
  return updated;
}

// ─── Context-aware threshold relaxation ─────────────────────────────────

function contextMultiplier(observation) {
  let m = 1;
  const ctx = observation.context;
  if (ctx.weather === 'RAIN') m *= T.CONTEXT_RELAX.RAIN;
  if (ctx.visibility === 'LOW') m *= T.CONTEXT_RELAX.LOW_VISIBILITY;
  if (ctx.ambientTempC && ctx.ambientTempC > T.CONTEXT_RELAX.HIGH_AMBIENT_THRESHOLD) {
    m *= T.CONTEXT_RELAX.HIGH_AMBIENT_TEMP;
  }
  return m;
}

// ─── Skill scoring ──────────────────────────────────────────────────────

function scoreSkill(skillId, recentObs, baseline) {
  const skillCfg = T.SKILLS[skillId];
  if (!skillCfg || !baseline) return { score: 50, penalties: [] };

  let rawScore = 100;
  const penalties = [];

  // Average the metrics across recent observations.
  const avgMetrics = {};
  const metricKeys = Object.keys(skillCfg.metrics);
  metricKeys.forEach((key) => {
    const values = recentObs.map((o) => o.metrics[key]).filter((v) => typeof v === 'number');
    avgMetrics[key] = values.length ? mean(values) : 0;
  });

  // Average context multiplier.
  const ctxMul = mean(recentObs.map(contextMultiplier));

  metricKeys.forEach((key) => {
    const cfg = skillCfg.metrics[key];
    const observed = avgMetrics[key];
    const base = baseline[key] || 0;

    // For "inverse" metrics (taskCompletionRate: higher is better), flip.
    let deviation;
    if (key === 'taskCompletionRate') {
      // Penalty for low completion rate.
      deviation = Math.max(0, 1 - observed); // 0 when 100%, 1 when 0%
    } else {
      // Adjust threshold by context.
      const adjustedThreshold = cfg.threshold * ctxMul;
      deviation = Math.max(0, observed - adjustedThreshold);
    }

    if (deviation <= 0) return;

    // Normalise deviation: how far above threshold, relative to the baseline spread.
    const baseRef = Math.max(base, cfg.threshold, 0.01);
    const normDeviation = deviation / baseRef;
    const penalty = clamp(Math.round(normDeviation * cfg.weight), 0, cfg.cap);

    if (penalty > 0) {
      rawScore -= penalty;
      penalties.push({ metric: key, observed: round(observed), baseline: round(base), penalty });
    }
  });

  // Bonus for exemplary behaviour.
  if (skillCfg.bonusThreshold !== undefined) {
    const bonusKey = Object.keys(skillCfg.metrics)[0];
    if (avgMetrics[bonusKey] < skillCfg.bonusThreshold) {
      rawScore = Math.min(100, rawScore + (skillCfg.bonusPoints || 0));
    }
  }

  return { score: clamp(Math.round(rawScore), 0, 100), penalties };
}

function computeTrend(currentScore, ledger, skillId) {
  const obs = ledger.observations;
  if (obs.length < T.SCORING_WINDOW * 2) return 'STABLE';

  // Compare current window vs. prior window.
  const priorObs = obs.slice(-(T.SCORING_WINDOW * 2), -T.SCORING_WINDOW);
  const priorBaseline = ledger.baseline; // approximate: use current baseline
  const priorResult = scoreSkill(skillId, priorObs, priorBaseline);
  const delta = currentScore - priorResult.score;

  if (delta >= 5) return 'UP';
  if (delta <= -5) return 'DOWN';
  return 'STABLE';
}

function computeAllSkills(ledger) {
  const obs = ledger.observations;
  const recent = obs.slice(-T.SCORING_WINDOW);
  const baseline = ledger.baseline;

  if (!baseline || recent.length < 1) return null;

  const skills = {};
  T.SKILL_IDS.forEach((id) => {
    const { score, penalties } = scoreSkill(id, recent, baseline);
    const trend = computeTrend(score, ledger, id);
    skills[id] = {
      score,
      label: T.labelFor(score),
      trend,
      penalties,
      updatedAt: new Date().toISOString(),
    };
  });
  return skills;
}

// ─── Recommendations ────────────────────────────────────────────────────

function generateRecommendations(operatorId, ledger) {
  const skills = ledger.skills;
  if (!skills) return [];

  const recs = [];
  const now = Date.now();
  const suppressSince = new Date(now - T.RECOMMEND_SUPPRESS_DAYS * DAY_MS).toISOString();

  // Recent training passes.
  const recentPasses = new Set(
    repo
      .list('trainingProgress', (p) => p.operatorId === operatorId && p.passed && p.completedAt >= suppressSince)
      .map((p) => p.moduleId)
  );

  // Check each skill.
  T.SKILL_IDS.forEach((skillId) => {
    const skill = skills[skillId];
    if (!skill) return;
    const moduleId = T.SKILL_TO_MODULE[skillId];
    if (recentPasses.has(moduleId)) return;

    // Low score trigger.
    if (skill.score < T.RECOMMEND_SCORE_THRESHOLD) {
      recs.push({
        moduleId,
        skillArea: skillId,
        reasonCode: 'SKILL_SCORE_LOW',
        params: { score: skill.score, threshold: T.RECOMMEND_SCORE_THRESHOLD },
        urgency: skill.score < 40 ? 'HIGH' : 'MEDIUM',
      });
      return; // one rec per skill
    }

    // Declining trend trigger.
    if (skill.trend === 'DOWN') {
      // Check if it's been declining for N consecutive shifts.
      const obs = ledger.observations;
      const windowScores = [];
      for (let i = Math.max(0, obs.length - T.RECOMMEND_TREND_SHIFTS); i < obs.length; i++) {
        const slice = obs.slice(Math.max(0, i - T.SCORING_WINDOW + 1), i + 1);
        const { score } = scoreSkill(skillId, slice, ledger.baseline);
        windowScores.push(score);
      }
      const allDeclining = windowScores.length >= T.RECOMMEND_TREND_SHIFTS &&
        windowScores.every((s, i) => i === 0 || s <= windowScores[i - 1]);

      if (allDeclining) {
        recs.push({
          moduleId,
          skillArea: skillId,
          reasonCode: 'SKILL_DECLINING',
          params: { score: skill.score, trend: 'DOWN', shifts: T.RECOMMEND_TREND_SHIFTS },
          urgency: 'MEDIUM',
        });
      }
    }
  });

  // Repeated safety rule trigger.
  const obs = ledger.observations;
  const recentObs = obs.slice(-T.RECOMMEND_SAFETY_REPEAT_M);
  if (recentObs.length >= T.RECOMMEND_SAFETY_REPEAT_M) {
    const ruleCounts = {};
    recentObs.forEach((o) => {
      (o.safetyRuleIds || []).forEach((ruleId) => {
        ruleCounts[ruleId] = (ruleCounts[ruleId] || 0) + 1;
      });
    });
    // Import the RULE_TO_MODULE mapping from training service.
    const RULE_TO_MODULE = {
      SEATBELT_VIOLATION: 'SIM_STARTUP',
      LOCKOUT_NOT_ENGAGED: 'SIM_SHUTDOWN',
      UNATTENDED_MACHINE: 'SIM_SHUTDOWN',
      PROXIMITY_CRITICAL: 'SIM_PROXIMITY_RAIN',
      PROXIMITY_WARNING: 'SIM_PROXIMITY_RAIN',
      OVERHEATING: 'SIM_OVERHEAT',
      LOW_OIL_PRESSURE: 'SIM_OVERHEAT',
    };
    Object.entries(ruleCounts).forEach(([ruleId, count]) => {
      if (count < T.RECOMMEND_SAFETY_REPEAT_N) return;
      const moduleId = RULE_TO_MODULE[ruleId];
      if (!moduleId || recentPasses.has(moduleId)) return;
      // Don't duplicate if already recommended via skill score.
      if (recs.some((r) => r.moduleId === moduleId)) return;
      recs.push({
        moduleId,
        skillArea: 'SAFETY_AWARENESS',
        reasonCode: 'SAFETY_REPEAT',
        params: { ruleId, count, outOf: T.RECOMMEND_SAFETY_REPEAT_M },
        urgency: 'HIGH',
      });
    });
  }

  // Sort: HIGH urgency first, then MEDIUM, then LOW.
  const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recs.sort((a, b) => (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2));

  return recs;
}

// ─── Post-training evaluation ───────────────────────────────────────────

function evaluatePostTraining(ledger) {
  const windows = ledger.postTrainingWindows || [];
  const now = Date.now();
  let changed = false;

  windows.forEach((win) => {
    if (win.status !== 'PENDING') return;

    // Check if window expired without enough data.
    const deadlineMs = Date.parse(win.completedAt) + T.POST_TRAINING_DAYS * DAY_MS;
    const shiftsAfter = ledger.observations.filter((o) => o.at > win.completedAt).length;

    if (shiftsAfter < T.MIN_SHIFTS_AFTER_TRAINING && now < deadlineMs) return; // not ready yet

    // Compute post-training score.
    const postObs = ledger.observations.filter((o) => o.at > win.completedAt);
    if (postObs.length === 0) return;

    const { score: postScore } = scoreSkill(win.skillArea, postObs, ledger.baseline);
    const preScore = win.preSnapshot.score;
    const delta = postScore - preScore;
    const improved = delta >= T.TRAINING_SUCCESS_DELTA;

    win.postSnapshot = {
      score: postScore,
      shiftsAnalyzed: postObs.length,
      evaluatedAt: new Date().toISOString(),
    };
    win.status = 'EVALUATED';
    win.improved = improved;
    win.delta = delta;
    changed = true;

    // If improved, accelerate baseline update.
    if (improved && ledger.baseline) {
      const latestObs = postObs[postObs.length - 1];
      ledger.baseline = updateBaseline(ledger.baseline, latestObs, T.BASELINE_ALPHA_FAST);
    }

    // Emit loop-closed event.
    emit('behavior:loop_closed', {
      operatorId: ledger.id,
      skillArea: win.skillArea,
      moduleId: win.moduleId,
      preScore,
      postScore,
      delta,
      improved,
      trainingScore: win.trainingScore,
    });
  });

  return changed;
}

// ─── Public API ─────────────────────────────────────────────────────────

function onShiftEnd(operatorId, summary, shift) {
  // Skip very short shifts.
  if ((summary.durationMin || 0) < T.MIN_ACTIVE_MINUTES) return null;

  const ledger = getLedger(operatorId);
  const observation = buildObservation(operatorId, summary, shift);

  // Append observation (bounded).
  ledger.observations.push(observation);
  if (ledger.observations.length > T.MAX_OBSERVATIONS) {
    ledger.observations = ledger.observations.slice(-T.MAX_OBSERVATIONS);
  }

  // Establish or update baseline.
  if (!ledger.baseline) {
    if (ledger.observations.length >= T.MIN_SHIFTS_FOR_BASELINE) {
      ledger.baseline = establishBaseline(ledger.observations);
    }
  } else {
    ledger.baseline = updateBaseline(ledger.baseline, observation);
  }

  // Compute skills.
  if (ledger.baseline) {
    ledger.skills = computeAllSkills(ledger);

    // Evaluate any post-training windows.
    evaluatePostTraining(ledger);
  }

  saveLedger(ledger);

  // Emit skill update via socket.
  if (ledger.skills) {
    emit('behavior:skills_updated', { operatorId, skills: ledger.skills });
  }

  return ledger;
}

function onTrainingComplete(operatorId, moduleId, { score, maxScore, passed }) {
  const ledger = getLedger(operatorId);
  if (!ledger.skills) return;

  // Find which skill this module maps to.
  const skillArea = Object.entries(T.SKILL_TO_MODULE).find(([, mid]) => mid === moduleId)?.[0];
  if (!skillArea) return;

  const currentSkill = ledger.skills[skillArea];
  if (!currentSkill) return;

  // Open post-training evaluation window.
  const window = {
    moduleId,
    skillArea,
    preSnapshot: {
      score: currentSkill.score,
      label: currentSkill.label,
    },
    trainingScore: score,
    trainingMaxScore: maxScore,
    trainingPassed: passed,
    completedAt: new Date().toISOString(),
    status: 'PENDING',
  };

  if (!ledger.postTrainingWindows) ledger.postTrainingWindows = [];
  // Replace any existing pending window for the same skill.
  ledger.postTrainingWindows = ledger.postTrainingWindows.filter(
    (w) => !(w.skillArea === skillArea && w.status === 'PENDING')
  );
  ledger.postTrainingWindows.push(window);

  saveLedger(ledger);
}

function getSkills(operatorId) {
  const ledger = getLedger(operatorId);
  return {
    operatorId,
    skills: ledger.skills || null,
    baseline: ledger.baseline ? { establishedAt: ledger.baseline.establishedAt, shiftCount: ledger.baseline.shiftCount } : null,
    observationCount: ledger.observations.length,
    minShiftsRequired: T.MIN_SHIFTS_FOR_BASELINE,
    postTrainingWindows: (ledger.postTrainingWindows || []).map(
      ({ moduleId, skillArea, preSnapshot, postSnapshot, status, improved, delta, trainingScore, trainingMaxScore, completedAt }) =>
        ({ moduleId, skillArea, preSnapshot, postSnapshot, status, improved, delta, trainingScore, trainingMaxScore, completedAt })
    ),
  };
}

function getRecommendations(operatorId) {
  const ledger = getLedger(operatorId);
  return generateRecommendations(operatorId, ledger);
}

function getObservations(operatorId, { limit = 10 } = {}) {
  const ledger = getLedger(operatorId);
  return ledger.observations.slice(-limit).reverse();
}

module.exports = {
  onShiftEnd,
  onTrainingComplete,
  getSkills,
  getRecommendations,
  getObservations,
};
