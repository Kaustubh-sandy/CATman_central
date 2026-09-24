const config = require('../config/env');
const bus = require('./bus');
const trainingService = require('./training.service');
const { emit } = require('../socket/socket');

// Offers a short lesson only when the machine is safely parked:
// IDLE + parking brake + hydraulic lockout, for longer than IDLE_LESSON_AFTER_SEC.
// Never while moving — the prompt is withdrawn the moment the machine leaves that state.

const idleSince = new Map();
const prompted = new Set();
let getShiftForMachine = () => null;

function init({ shiftLookup }) {
  getShiftForMachine = shiftLookup;

  bus.on('telemetry', (machineId, t) => {
    const parked = t.state === 'IDLE' && t.parkingBrake === true && t.hydraulicLockout === true;

    if (!parked) {
      idleSince.delete(machineId);
      if (prompted.delete(machineId)) emit('training:idle_prompt_cancel', { machineId });
      return;
    }

    if (!idleSince.has(machineId)) idleSince.set(machineId, Date.now());
    const idleSec = (Date.now() - idleSince.get(machineId)) / 1000;
    if (idleSec < config.idleLessonAfterSec || prompted.has(machineId)) return;

    const shift = getShiftForMachine(machineId);
    if (!shift) return;
    const allRecs = trainingService.recommend(shift.operatorId);
    // Prefer idle/shutdown recommendation from behavior engine, fallback to first recommendation.
    const rec = allRecs.find((r) => r.skillArea === 'IDLE_MANAGEMENT' || r.moduleId === 'SIM_SHUTDOWN') || allRecs[0];
    prompted.add(machineId);
    emit('training:idle_prompt', {
      machineId,
      operatorId: shift.operatorId,
      idleMinutes: Math.round(idleSec / 60),
      moduleId: rec?.moduleId || 'SIM_SHUTDOWN',
      title: rec?.module?.title || 'End-of-shift shutdown',
      durationMin: rec?.module?.durationMin || 2,
    });
  });
}

module.exports = { init };
