const config = require('../config/env');
const repo = require('../db/repo');
const bus = require('./bus');
const audit = require('./audit.service');
const telemetryStore = require('./telemetryStore.service');
const connectivityService = require('./connectivity.service');
const machineService = require('./machine.service');
const operatorService = require('./operator.service');
const taskService = require('./task.service');
const precheckService = require('./precheck.service');
const incidentService = require('./incident.service');
const mqttService = require('./mqtt.service');
const behaviorEngine = require('./behaviorEngine.service');
const { emit } = require('../socket/socket');

const STATES = {
  NOT_STARTED: 'NOT_STARTED',
  PRECHECK_RUNNING: 'PRECHECK_RUNNING',
  PRECHECK_PASSED: 'PRECHECK_PASSED',
  PRECHECK_FAILED: 'PRECHECK_FAILED',
  CHECKLIST_COMPLETE: 'CHECKLIST_COMPLETE',
  TASK_ACTIVE: 'TASK_ACTIVE',
  TASK_PAUSED: 'TASK_PAUSED',
  TASK_COMPLETE: 'TASK_COMPLETE',
  SHIFT_ENDED: 'SHIFT_ENDED',
};

// verify: SENSOR = checked against live telemetry, EVENT = needs a HORN event from the machine.
const CHECKLIST_ITEMS = [
  { id: 'SEATBELT_FASTENED', verify: 'SENSOR' },
  { id: 'WALKAROUND_DONE' },
  { id: 'MIRRORS_ADJUSTED' },
  { id: 'PPE_WORN' },
  { id: 'AREA_CLEAR' },
  { id: 'HORN_TESTED', verify: 'EVENT' },
];

const XP_PER_TASK = 10;
const XP_CLEAN_SHIFT = 50;
const CO2_KG_PER_LITRE = 2.68;

const hornTimers = new Map();

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function emptyChecklist() {
  return {
    items: Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.id, { checked: false, verify: i.verify || null }])),
    hornTest: null,
    completedAt: null,
  };
}

function save(shift) {
  const saved = repo.put('shifts', shift.id, { ...shift, updatedAt: new Date().toISOString() });
  emit('shift:updated', saved);
  return saved;
}

function assertState(shift, allowed, action) {
  if (!allowed.includes(shift.state)) {
    throw httpError(409, `Cannot ${action} while shift is ${shift.state}`, 'INVALID_STATE');
  }
}

function transition(shift, to, auditType, data = {}) {
  const from = shift.state;
  shift.state = to;
  shift.history = [...(shift.history || []), { from, to, at: new Date().toISOString() }];
  audit.log(auditType || `SHIFT_${to}`, { operatorId: shift.operatorId, machineId: shift.machineId, shiftId: shift.id, from, to, ...data });
  return shift;
}

function createShift(operatorId) {
  const operator = operatorService.getById(operatorId);
  const shift = {
    id: `${operatorId}-${Date.now()}`,
    operatorId,
    machineId: operator?.assignedMachineId || null,
    date: taskService.today(),
    state: STATES.NOT_STARTED,
    precheck: null,
    checklist: emptyChecklist(),
    activeTaskId: null,
    activeSince: null,
    startedAt: null,
    endedAt: null,
    stats: null,
    summary: null,
    history: [],
    createdAt: new Date().toISOString(),
  };
  audit.log('SHIFT_CREATED', { operatorId, machineId: shift.machineId, shiftId: shift.id });
  return save(shift);
}

function latestShift(operatorId) {
  return repo
    .list('shifts', (s) => s.operatorId === operatorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

function getCurrent(operatorId) {
  return latestShift(operatorId) || createShift(operatorId);
}

function getActiveShiftForMachine(machineId) {
  return (
    repo
      .list('shifts', (s) => s.machineId === machineId && s.state !== STATES.SHIFT_ENDED)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null
  );
}

function findSpareMachines(shift) {
  const busy = new Set(
    repo
      .list(
        'shifts',
        (s) => ![STATES.SHIFT_ENDED, STATES.NOT_STARTED, STATES.PRECHECK_FAILED].includes(s.state) && s.operatorId !== shift.operatorId
      )
      .map((s) => s.machineId)
  );
  return machineService
    .getAllMachines()
    .filter((m) => m.machineId !== shift.machineId && !busy.has(m.machineId))
    .map((m) => ({ machineId: m.machineId, status: connectivityService.getStatus(m.machineId) }))
    .sort((a, b) => (a.status === 'ONLINE' ? -1 : 1) - (b.status === 'ONLINE' ? -1 : 1));
}

// ---------------- Pre-check ----------------

function startPrecheck(operatorId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.NOT_STARTED, STATES.PRECHECK_FAILED, STATES.PRECHECK_PASSED], 'start pre-check');
  if (!shift.machineId) throw httpError(400, 'No machine assigned for this shift');

  shift.precheck = precheckService.start({ shiftId: shift.id, machineId: shift.machineId, operatorId });
  shift.checklist = emptyChecklist();
  transition(shift, STATES.PRECHECK_RUNNING, 'PRECHECK_STARTED', { requestId: shift.precheck.requestId });
  return save(shift);
}

function cancelPrecheck(operatorId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.PRECHECK_RUNNING], 'cancel pre-check');
  precheckService.cancel(shift.precheck?.requestId);
  shift.precheck = { ...shift.precheck, status: 'CANCELLED' };
  transition(shift, STATES.NOT_STARTED, 'PRECHECK_CANCELLED');
  return save(shift);
}

function onPrecheckUpdate(shiftId, mutate) {
  const shift = repo.get('shifts', shiftId);
  if (!shift || shift.state !== STATES.PRECHECK_RUNNING) return;
  shift.precheck = mutate(shift.precheck || {});
  const saved = save(shift);
  emit('precheck:progress', { shiftId, precheck: saved.precheck });
}

function onPrecheckComplete(shiftId, result) {
  const shift = repo.get('shifts', shiftId);
  if (!shift || shift.state !== STATES.PRECHECK_RUNNING) return;

  shift.precheck = {
    ...shift.precheck,
    ...result,
    needsAck: result.overall === 'PASS_WITH_WARNINGS',
    warningsAcknowledgedAt: null,
  };

  result.sensors
    .filter((s) => s.override)
    .forEach((s) =>
      audit.log('PRECHECK_MANUAL_OVERRIDE', {
        operatorId: shift.operatorId,
        machineId: shift.machineId,
        shiftId,
        sensor: s.sensor,
        autoStatus: s.autoStatus,
        status: s.status,
        note: s.note || null,
      })
    );

  if (result.overall === 'FAIL') {
    const failedSensors = result.sensors.filter((s) => s.status === 'FAIL' || s.status === 'NO_RESPONSE');
    shift.precheck.failedSensors = failedSensors;
    shift.precheck.machineOffline = result.noResponse;
    shift.precheck.spareMachines = findSpareMachines(shift);
    if (!result.noResponse) {
      shift.precheck.maintenanceTicketId = incidentService.createMaintenanceTicket({ shift, failedSensors }).id;
    }
    transition(shift, STATES.PRECHECK_FAILED, 'PRECHECK_FAILED', {
      overall: result.overall,
      mode: shift.precheck.mode,
      verifiedBy: result.verifiedBy,
      failed: failedSensors.map((s) => s.sensor),
    });
  } else {
    transition(shift, STATES.PRECHECK_PASSED, 'PRECHECK_PASSED', {
      overall: result.overall,
      mode: shift.precheck.mode,
      verifiedBy: result.verifiedBy,
    });
  }

  const saved = save(shift);
  emit('precheck:result', { shiftId, precheck: saved.precheck });
}

function acknowledgeWarnings(operatorId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.PRECHECK_PASSED], 'acknowledge warnings');
  if (!shift.precheck?.needsAck) throw httpError(409, 'No warnings to acknowledge');
  shift.precheck.warningsAcknowledgedAt = new Date().toISOString();
  audit.log('PRECHECK_WARNINGS_ACKNOWLEDGED', {
    operatorId,
    machineId: shift.machineId,
    shiftId: shift.id,
    warnings: shift.precheck.sensors.filter((s) => s.status !== 'OK').map((s) => `${s.sensor}:${s.status}`),
  });
  return save(shift);
}

function switchMachine(operatorId, machineId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.NOT_STARTED, STATES.PRECHECK_FAILED], 'switch machine');
  if (!machineService.getMachineById(machineId)) throw httpError(404, `Machine ${machineId} not found`);
  const from = shift.machineId;
  shift.machineId = machineId;
  shift.precheck = null;
  shift.checklist = emptyChecklist();
  transition(shift, STATES.NOT_STARTED, 'MACHINE_SWITCHED', { fromMachine: from, toMachine: machineId });
  return save(shift);
}

// ---------------- Checklist ----------------

function assertChecklistOpen(shift) {
  assertState(shift, [STATES.PRECHECK_PASSED], 'update the checklist');
  if (shift.precheck?.needsAck && !shift.precheck.warningsAcknowledgedAt) {
    throw httpError(409, 'Acknowledge the pre-check warnings first', 'WARNINGS_NOT_ACKNOWLEDGED');
  }
}

function seatbeltRejected(shift, operatorId) {
  shift.checklist.items.SEATBELT_FASTENED = {
    ...shift.checklist.items.SEATBELT_FASTENED,
    checked: false,
    rejected: { code: 'SEATBELT_NOT_DETECTED', at: new Date().toISOString() },
  };
  audit.log('CHECKLIST_MISMATCH', { operatorId, machineId: shift.machineId, shiftId: shift.id, item: 'SEATBELT_FASTENED', telemetry: 'seatbeltStatus=false' });
  save(shift);
  return httpError(409, 'Seatbelt not detected — please fasten', 'SEATBELT_NOT_DETECTED');
}

function checkItem(operatorId, itemId, checked) {
  const shift = getCurrent(operatorId);
  assertChecklistOpen(shift);
  const item = shift.checklist.items[itemId];
  if (!item) throw httpError(400, `Unknown checklist item ${itemId}`);
  if (itemId === 'HORN_TESTED') throw httpError(400, 'Use "Test horn" — the machine confirms it', 'USE_HORN_TEST');

  if (itemId === 'SEATBELT_FASTENED' && checked) {
    const telemetry = telemetryStore.getLatest(shift.machineId);
    if (!telemetry || telemetry.seatbeltStatus !== true) throw seatbeltRejected(shift, operatorId);
    shift.checklist.items[itemId] = { ...item, checked: true, rejected: null, verifiedBy: 'SENSOR', at: new Date().toISOString() };
  } else {
    shift.checklist.items[itemId] = { ...item, checked: !!checked, rejected: null, at: new Date().toISOString() };
  }
  audit.log('CHECKLIST_ITEM', { operatorId, machineId: shift.machineId, shiftId: shift.id, item: itemId, checked: !!checked });
  return save(shift);
}

function testHorn(operatorId) {
  const shift = getCurrent(operatorId);
  assertChecklistOpen(shift);
  mqttService.publishCommand(shift.machineId, 'horn', { operatorId, timestamp: new Date().toISOString() });
  shift.checklist.hornTest = { status: 'WAITING', requestedAt: new Date().toISOString() };
  shift.checklist.items.HORN_TESTED = { ...shift.checklist.items.HORN_TESTED, checked: false, rejected: null };

  clearTimeout(hornTimers.get(shift.id));
  hornTimers.set(
    shift.id,
    setTimeout(() => {
      const current = repo.get('shifts', shift.id);
      if (current?.checklist?.hornTest?.status !== 'WAITING') return;
      current.checklist.hornTest = { ...current.checklist.hornTest, status: 'NOT_DETECTED' };
      current.checklist.items.HORN_TESTED = {
        ...current.checklist.items.HORN_TESTED,
        rejected: { code: 'HORN_NOT_DETECTED', at: new Date().toISOString() },
      };
      audit.log('CHECKLIST_MISMATCH', { operatorId, machineId: current.machineId, shiftId: current.id, item: 'HORN_TESTED' });
      save(current);
    }, config.hornTestWindowMs)
  );
  return save(shift);
}

function onHornEvent(machineId, event) {
  const shift = getActiveShiftForMachine(machineId);
  if (!shift || shift.state !== STATES.PRECHECK_PASSED) return;
  const test = shift.checklist?.hornTest;
  if (!test || test.status !== 'WAITING') return;
  if (Date.now() - Date.parse(test.requestedAt) > config.hornTestWindowMs) return;

  clearTimeout(hornTimers.get(shift.id));
  shift.checklist.hornTest = { ...test, status: 'CONFIRMED', confirmedAt: new Date().toISOString(), source: event.data?.source || null };
  shift.checklist.items.HORN_TESTED = {
    ...shift.checklist.items.HORN_TESTED,
    checked: true,
    rejected: null,
    verifiedBy: 'HORN_EVENT',
    at: new Date().toISOString(),
  };
  audit.log('CHECKLIST_ITEM', { operatorId: shift.operatorId, machineId, shiftId: shift.id, item: 'HORN_TESTED', checked: true, verifiedBy: 'HORN_EVENT' });
  save(shift);
}

function completeChecklist(operatorId) {
  const shift = getCurrent(operatorId);
  assertChecklistOpen(shift);
  const missing = CHECKLIST_ITEMS.filter((i) => !shift.checklist.items[i.id]?.checked).map((i) => i.id);
  if (missing.length) throw httpError(409, `Checklist incomplete: ${missing.join(', ')}`, 'CHECKLIST_INCOMPLETE');

  // Seatbelt could have been unbuckled since it was ticked.
  const telemetry = telemetryStore.getLatest(shift.machineId);
  if (!telemetry || telemetry.seatbeltStatus !== true) throw seatbeltRejected(shift, operatorId);

  shift.checklist.completedAt = new Date().toISOString();
  transition(shift, STATES.CHECKLIST_COMPLETE, 'CHECKLIST_COMPLETE');
  return save(shift);
}

// ---------------- Tasks ----------------

function sendShiftCommand(shift, action, taskId = null) {
  try {
    mqttService.publishCommand(shift.machineId, 'shift', { action, operatorId: shift.operatorId, taskId });
  } catch (err) {
    console.error(`[Shift] shift ${action} command not delivered:`, err.message);
  }
}

function startTask(operatorId, taskId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.CHECKLIST_COMPLETE, STATES.TASK_COMPLETE], 'start a task');
  const task = taskId ? taskService.getTask(taskId) : taskService.nextPendingTask(operatorId);
  if (!task) throw httpError(409, 'No pending tasks left today', 'NO_PENDING_TASKS');

  if (!shift.startedAt) {
    const t = telemetryStore.getLatest(shift.machineId);
    shift.startedAt = new Date().toISOString();
    shift.stats = {
      baseline: t ? { fuelConsumedLitres: t.fuelConsumedLitres, idleTime: t.idleTime } : null,
    };
    sendShiftCommand(shift, 'START', task.id);
  }

  taskService.start(task.id, { machineId: shift.machineId, operatorId });
  shift.activeTaskId = task.id;
  shift.activeSince = shift.activeSince || new Date().toISOString();
  transition(shift, STATES.TASK_ACTIVE, 'TASK_ACTIVE', { taskId: task.id });
  return save(shift);
}

function pauseTask(operatorId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.TASK_ACTIVE], 'pause');
  taskService.pause(shift.activeTaskId);
  shift.activeSince = null;
  transition(shift, STATES.TASK_PAUSED, 'TASK_PAUSED', { taskId: shift.activeTaskId });
  return save(shift);
}

function resumeTask(operatorId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.TASK_PAUSED], 'resume');
  taskService.start(shift.activeTaskId, { machineId: shift.machineId, operatorId });
  shift.activeSince = new Date().toISOString();
  transition(shift, STATES.TASK_ACTIVE, 'TASK_RESUMED', { taskId: shift.activeTaskId });
  return save(shift);
}

function completeTask(operatorId) {
  const shift = getCurrent(operatorId);
  assertState(shift, [STATES.TASK_ACTIVE, STATES.TASK_PAUSED], 'complete the task');
  const task = taskService.complete(shift.activeTaskId);
  shift.lastCompletedTaskId = task.id;
  shift.activeTaskId = null;
  transition(shift, STATES.TASK_COMPLETE, 'TASK_COMPLETE', { taskId: task.id, result: task.result });
  return save(shift);
}

// ---------------- End of shift ----------------

function buildSummary(shift, handoverNote) {
  const since = shift.startedAt || shift.createdAt;
  const t = telemetryStore.getLatest(shift.machineId);
  const base = shift.stats?.baseline;
  const fuelUsedL = t && base ? Math.max(0, t.fuelConsumedLitres - base.fuelConsumedLitres) : 0;
  const idleMinutes = t && base ? Math.max(0, t.idleTime - base.idleTime) : 0;

  const alerts = repo.list('alerts', (a) => a.machineId === shift.machineId && a.detectedAt >= since);
  const bySeverity = (sev) => alerts.filter((a) => a.severity === sev).length;
  const critical = bySeverity('CRITICAL');
  const high = bySeverity('HIGH');
  const medium = bySeverity('MEDIUM');
  const sosCount = repo.list('incidents', (i) => i.type === 'SOS' && i.operatorId === shift.operatorId && i.createdAt >= since).length;

  const tasks = taskService.getTodayTasks(shift.operatorId).filter((tk) => tk.completedAt && tk.completedAt >= since);
  const tasksDone = tasks.filter((tk) => tk.status === 'COMPLETED');
  const cleanShift = critical === 0 && sosCount === 0;
  const xpEarned = tasksDone.length * XP_PER_TASK + (cleanShift && tasksDone.length > 0 ? XP_CLEAN_SHIFT : 0);

  return {
    durationMin: Math.round((Date.now() - Date.parse(since)) / 60000),
    tasksDone: tasksDone.length,
    tasks: tasks.map((tk) => ({ id: tk.id, title: tk.title, status: tk.status, result: tk.result || null })),
    fuelUsedL: Number(fuelUsedL.toFixed(2)),
    fuelCostInr: Math.round(fuelUsedL * config.fuelPriceInr),
    co2Kg: Number((fuelUsedL * CO2_KG_PER_LITRE).toFixed(2)),
    idleMinutes: Number(idleMinutes.toFixed(1)),
    alerts: { total: alerts.length, critical, high, medium },
    sosCount,
    safetyScore: Math.max(0, 100 - critical * 15 - high * 8 - medium * 3),
    cleanShift,
    xpEarned,
    handoverNote: handoverNote || '',
  };
}

function endShift(operatorId, handoverNote) {
  const shift = getCurrent(operatorId);
  assertState(
    shift,
    [STATES.PRECHECK_FAILED, STATES.PRECHECK_PASSED, STATES.CHECKLIST_COMPLETE, STATES.TASK_ACTIVE, STATES.TASK_PAUSED, STATES.TASK_COMPLETE],
    'end the shift'
  );
  if (shift.activeTaskId) {
    taskService.stopIncomplete(shift.activeTaskId);
    shift.activeTaskId = null;
  }
  shift.summary = buildSummary(shift, handoverNote);
  shift.endedAt = new Date().toISOString();
  shift.activeSince = null;
  if (shift.startedAt) sendShiftCommand(shift, 'END');
  transition(shift, STATES.SHIFT_ENDED, 'SHIFT_ENDED', { summary: shift.summary });
  const saved = save(shift);
  operatorService.addXp(operatorId, shift.summary.xpEarned, 'SHIFT_COMPLETE');

  // Feed the behavior engine for skill scoring and personalized recommendations.
  try {
    behaviorEngine.onShiftEnd(operatorId, shift.summary, shift);
  } catch (err) {
    console.error('[Behavior] Error processing shift end:', err.message);
  }

  return saved;
}

function newShift(operatorId) {
  const shift = latestShift(operatorId);
  if (shift && ![STATES.SHIFT_ENDED, STATES.NOT_STARTED, STATES.PRECHECK_FAILED].includes(shift.state)) {
    throw httpError(409, 'End the current shift first', 'SHIFT_IN_PROGRESS');
  }
  if (shift && shift.state !== STATES.SHIFT_ENDED) {
    shift.endedAt = new Date().toISOString();
    transition(shift, STATES.SHIFT_ENDED, 'SHIFT_DISCARDED');
    save(shift);
  }
  return createShift(operatorId);
}

function init() {
  precheckService.configure({ onUpdate: onPrecheckUpdate, onComplete: onPrecheckComplete });
  bus.on('machineEvent', (machineId, event) => {
    if (event.type === 'HORN') onHornEvent(machineId, event);
  });

  // A backend restart loses in-flight pre-checks; don't leave a shift stuck in RUNNING.
  repo
    .list('shifts', (s) => s.state === STATES.PRECHECK_RUNNING)
    .forEach((s) => {
      s.precheck = { ...s.precheck, status: 'CANCELLED' };
      transition(s, STATES.NOT_STARTED, 'PRECHECK_CANCELLED', { reason: 'BACKEND_RESTART' });
      save(s);
    });
}

module.exports = {
  STATES,
  CHECKLIST_ITEMS,
  init,
  getCurrent,
  getActiveShiftForMachine,
  startPrecheck,
  cancelPrecheck,
  acknowledgeWarnings,
  switchMachine,
  checkItem,
  testHorn,
  completeChecklist,
  startTask,
  pauseTask,
  resumeTask,
  completeTask,
  endShift,
  newShift,
};
