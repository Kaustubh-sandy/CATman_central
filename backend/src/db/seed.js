const repo = require('./repo');
const operators = require('../data/operators.json');
const { seedBehaviorHistory } = require('./seedBehavior');

const MACHINES = [
  { machineId: 'EXC001', name: 'Excavator 001', type: 'Hydraulic Excavator' },
  { machineId: 'EXC002', name: 'Excavator 002', type: 'Hydraulic Excavator' },
  { machineId: 'EXC003', name: 'Excavator 003', type: 'Hydraulic Excavator' },
];

// Seeds machines and operators the first time the app runs against an empty
// Firestore (or on every start when running in-memory). Existing docs are kept.
function ensureSeeded({ force = false, resetBehavior = false } = {}) {
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

  // Demo skill history for OP1001: synthetic past shifts replayed through the skill
  // engine, so every score is calculated. Never replaces a ledger with real shifts
  // unless resetBehavior is set.
  if (seedBehaviorHistory({ reset: resetBehavior })) created.push('behaviorLedger/OP1001');

  if (created.length) console.log(`[Seed] Created ${created.length} docs: ${created.join(', ')}`);
  return created;
}

module.exports = { ensureSeeded, MACHINES };
