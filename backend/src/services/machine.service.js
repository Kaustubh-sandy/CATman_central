const { db, isConfigured } = require('./firebase.service');

// Default initial machines
const INITIAL_MACHINES = [
  {
    machineId: 'EXC001',
    name: 'Excavator 001',
    type: 'Hydraulic Excavator',
  },
  {
    machineId: 'EXC002',
    name: 'Excavator 002',
    type: 'Hydraulic Excavator',
  },
  {
    machineId: 'EXC003',
    name: 'Excavator 003',
    type: 'Hydraulic Excavator',
  },
];

// In-memory fallback if Firestore is not yet configured
const inMemoryMachines = new Map(
  INITIAL_MACHINES.map((m) => [
    m.machineId,
    { ...m, createdAt: new Date().toISOString() },
  ])
);

async function getAllMachines() {
  if (isConfigured() && db) {
    const snapshot = await db.collection('machines').get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  return Array.from(inMemoryMachines.values());
}

async function getMachineById(machineId) {
  if (!machineId) return null;

  if (isConfigured() && db) {
    const docRef = db.collection('machines').doc(machineId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return null;
    }
    return {
      id: docSnap.id,
      ...docSnap.data(),
    };
  }

  return inMemoryMachines.get(machineId) || null;
}

async function seedInitialMachines() {
  const results = [];

  if (isConfigured() && db) {
    for (const machine of INITIAL_MACHINES) {
      const docRef = db.collection('machines').doc(machine.machineId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        const payload = {
          ...machine,
          createdAt: new Date().toISOString(),
        };
        await docRef.set(payload);
        console.log(`[Seed] Created machine: ${machine.machineId}`);
        results.push({ machineId: machine.machineId, action: 'created' });
      } else {
        console.log(`[Seed] Machine already exists: ${machine.machineId}`);
        results.push({ machineId: machine.machineId, action: 'exists' });
      }
    }
    return results;
  }

  console.log('[Seed] Firestore not configured. In-memory machines ready: EXC001, EXC002');
  return INITIAL_MACHINES.map((m) => ({ machineId: m.machineId, action: 'in-memory' }));
}

module.exports = {
  getAllMachines,
  getMachineById,
  seedInitialMachines,
  INITIAL_MACHINES,
};
