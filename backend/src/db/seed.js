const repo = require('./repo');
const operators = require('../data/operators.json');

const MACHINES = [
  { machineId: 'EXC001', name: 'Excavator 001', type: 'Hydraulic Excavator' },
  { machineId: 'EXC002', name: 'Excavator 002', type: 'Hydraulic Excavator' },
  { machineId: 'EXC003', name: 'Excavator 003', type: 'Hydraulic Excavator' },
];

// Seeds machines and operators the first time the app runs against an empty
// Firestore (or on every start when running in-memory). Existing docs are kept.
function ensureSeeded({ force = false } = {}) {
  const created = [];
  const now = new Date().toISOString();

  MACHINES.forEach((m) => {
    if (force || !repo.get('machines', m.machineId)) {
      repo.put('machines', m.machineId, { ...m, createdAt: now });
      created.push(`machines/${m.machineId}`);
    }
  });

  operators.forEach((op) => {
    if (force || !repo.get('operators', op.operatorId)) {
      repo.put('operators', op.operatorId, { ...op, createdAt: now });
      created.push(`operators/${op.operatorId}`);
    }
  });

  // Seed initial behaviorLedger for OP1001 if not present.
  if (force || !repo.get('behaviorLedger', 'OP1001')) {
    const day = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const sampleObs = [
      {
        shiftId: 'SHIFT_PREV_5',
        date: new Date(nowMs - 5 * day).toISOString().slice(0, 10),
        at: new Date(nowMs - 5 * day).toISOString(),
        activeMinutes: 240,
        context: { weather: 'CLEAR', visibility: 'GOOD', taskTypes: ['EXCAVATION'], taskCount: 4, completedTaskCount: 4 },
        metrics: {
          idleRatio: 0.18, unjustifiedIdleRatio: 0.08, unjustifiedIdleMin: 19.2, fuelPerCycle: 1.4, idleFuelRatio: 0.15,
          rpmVariance: 180, vibrationRatio: 0.07, throttleChopRate: 1.2, taskTimeOverrun: 0.04, taskCompletionRate: 1,
          cycleRateVariance: 0.10, safetyEventsPerHour: 0.25, seatbeltViolations: 0, proximityEvents: 1, impactRate: 0,
        },
        safetyRuleIds: ['PROXIMITY_WARNING'],
      },
      {
        shiftId: 'SHIFT_PREV_4',
        date: new Date(nowMs - 4 * day).toISOString().slice(0, 10),
        at: new Date(nowMs - 4 * day).toISOString(),
        activeMinutes: 220,
        context: { weather: 'CLEAR', visibility: 'GOOD', taskTypes: ['LOADING'], taskCount: 3, completedTaskCount: 3 },
        metrics: {
          idleRatio: 0.22, unjustifiedIdleRatio: 0.11, unjustifiedIdleMin: 24.2, fuelPerCycle: 1.5, idleFuelRatio: 0.18,
          rpmVariance: 175, vibrationRatio: 0.08, throttleChopRate: 1.1, taskTimeOverrun: 0.06, taskCompletionRate: 1,
          cycleRateVariance: 0.11, safetyEventsPerHour: 0.27, seatbeltViolations: 0, proximityEvents: 1, impactRate: 0,
        },
        safetyRuleIds: ['PROXIMITY_WARNING'],
      },
      {
        shiftId: 'SHIFT_PREV_3',
        date: new Date(nowMs - 3 * day).toISOString().slice(0, 10),
        at: new Date(nowMs - 3 * day).toISOString(),
        activeMinutes: 250,
        context: { weather: 'CLEAR', visibility: 'GOOD', taskTypes: ['EXCAVATION', 'GRADING'], taskCount: 5, completedTaskCount: 5 },
        metrics: {
          idleRatio: 0.25, unjustifiedIdleRatio: 0.14, unjustifiedIdleMin: 35.0, fuelPerCycle: 1.55, idleFuelRatio: 0.20,
          rpmVariance: 190, vibrationRatio: 0.09, throttleChopRate: 1.3, taskTimeOverrun: 0.07, taskCompletionRate: 1,
          cycleRateVariance: 0.12, safetyEventsPerHour: 0.24, seatbeltViolations: 0, proximityEvents: 0, impactRate: 0,
        },
        safetyRuleIds: [],
      },
      {
        shiftId: 'SHIFT_PREV_2',
        date: new Date(nowMs - 2 * day).toISOString().slice(0, 10),
        at: new Date(nowMs - 2 * day).toISOString(),
        activeMinutes: 260,
        context: { weather: 'RAIN', visibility: 'LOW', taskTypes: ['EXCAVATION'], taskCount: 4, completedTaskCount: 4 },
        metrics: {
          idleRatio: 0.27, unjustifiedIdleRatio: 0.15, unjustifiedIdleMin: 39.0, fuelPerCycle: 1.6, idleFuelRatio: 0.22,
          rpmVariance: 185, vibrationRatio: 0.08, throttleChopRate: 1.2, taskTimeOverrun: 0.08, taskCompletionRate: 1,
          cycleRateVariance: 0.13, safetyEventsPerHour: 0.23, seatbeltViolations: 0, proximityEvents: 1, impactRate: 0,
        },
        safetyRuleIds: ['PROXIMITY_WARNING'],
      },
      {
        shiftId: 'SHIFT_PREV_1',
        date: new Date(nowMs - 1 * day).toISOString().slice(0, 10),
        at: new Date(nowMs - 1 * day).toISOString(),
        activeMinutes: 230,
        context: { weather: 'CLEAR', visibility: 'GOOD', taskTypes: ['LOADING'], taskCount: 3, completedTaskCount: 3 },
        metrics: {
          idleRatio: 0.29, unjustifiedIdleRatio: 0.17, unjustifiedIdleMin: 39.1, fuelPerCycle: 1.62, idleFuelRatio: 0.23,
          rpmVariance: 178, vibrationRatio: 0.07, throttleChopRate: 1.0, taskTimeOverrun: 0.05, taskCompletionRate: 1,
          cycleRateVariance: 0.11, safetyEventsPerHour: 0.26, seatbeltViolations: 0, proximityEvents: 0, impactRate: 0,
        },
        safetyRuleIds: [],
      },
    ];

    repo.put('behaviorLedger', 'OP1001', {
      id: 'OP1001',
      observations: sampleObs,
      baseline: {
        idleRatio: 0.18,
        unjustifiedIdleRatio: 0.08,
        fuelPerCycle: 1.45,
        idleFuelRatio: 0.16,
        rpmVariance: 180,
        vibrationRatio: 0.08,
        taskTimeOverrun: 0.05,
        safetyEventsPerHour: 0.25,
        impactRate: 0,
        taskCompletionRate: 1.0,
        cycleRateVariance: 0.11,
        establishedAt: new Date(nowMs - 5 * day).toISOString(),
        shiftCount: 5,
      },
      skills: {
        IDLE_MANAGEMENT: {
          score: 52,
          label: 'NEEDS_ATTENTION',
          trend: 'DOWN',
          penalties: [
            { metric: 'idleRatio', observed: 0.26, baseline: 0.18, penalty: 28 },
            { metric: 'unjustifiedIdleRatio', observed: 0.14, baseline: 0.08, penalty: 20 },
          ],
          updatedAt: new Date().toISOString(),
        },
        FUEL_EFFICIENCY: {
          score: 68,
          label: 'DEVELOPING',
          trend: 'STABLE',
          penalties: [
            { metric: 'idleFuelRatio', observed: 0.21, baseline: 0.16, penalty: 18 },
            { metric: 'fuelPerCycleRatio', observed: 0.18, baseline: 0.14, penalty: 14 },
          ],
          updatedAt: new Date().toISOString(),
        },
        SMOOTH_OPERATION: {
          score: 84,
          label: 'GOOD',
          trend: 'UP',
          penalties: [
            { metric: 'rpmVarianceRatio', observed: 0.12, baseline: 0.10, penalty: 16 },
          ],
          updatedAt: new Date().toISOString(),
        },
        SAFETY_AWARENESS: {
          score: 76,
          label: 'DEVELOPING',
          trend: 'STABLE',
          penalties: [
            { metric: 'safetyEventsPerHour', observed: 0.26, baseline: 0.25, penalty: 24 },
          ],
          updatedAt: new Date().toISOString(),
        },
        TASK_EXECUTION: {
          score: 88,
          label: 'GOOD',
          trend: 'UP',
          penalties: [
            { metric: 'taskTimeOverrun', observed: 0.06, baseline: 0.05, penalty: 12 },
          ],
          updatedAt: new Date().toISOString(),
        },
      },
      postTrainingWindows: [
        {
          moduleId: 'SIM_PROXIMITY_RAIN',
          skillArea: 'SAFETY_AWARENESS',
          preSnapshot: { score: 60, label: 'DEVELOPING' },
          postSnapshot: { score: 76, shiftsAnalyzed: 4, evaluatedAt: new Date(nowMs - 2 * day).toISOString() },
          status: 'EVALUATED',
          improved: true,
          delta: 16,
          trainingScore: 92,
          trainingMaxScore: 100,
          trainingPassed: true,
          completedAt: new Date(nowMs - 4 * day).toISOString(),
        },
      ],
    });
    created.push('behaviorLedger/OP1001');
  }

  if (created.length) console.log(`[Seed] Created ${created.length} docs: ${created.join(', ')}`);
  return created;
}

module.exports = { ensureSeeded, MACHINES };
