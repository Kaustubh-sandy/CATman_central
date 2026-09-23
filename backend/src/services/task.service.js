const repo = require('../db/repo');
const templates = require('../data/tasks.json');
const telemetryStore = require('./telemetryStore.service');
const audit = require('./audit.service');
const { emit } = require('../socket/socket');

const MIN_MINUTES_FOR_RATE = 0.5;

function today() {
  return new Date().toLocaleDateString('en-CA');
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Creates today's tasks for an operator from the templates the first time they're asked for.
function ensureToday(operatorId) {
  const date = today();
  const existing = repo.list('tasks', (t) => t.operatorId === operatorId && t.date === date);
  if (existing.length) return;

  (templates[operatorId] || []).forEach((tpl, i) => {
    repo.put('tasks', `${tpl.templateId}-${date}`, {
      ...tpl,
      operatorId,
      date,
      order: i,
      status: 'PENDING',
      activeMs: 0,
      createdAt: new Date().toISOString(),
    });
  });
}

function getTodayTasks(operatorId) {
  ensureToday(operatorId);
  const date = today();
  return repo
    .list('tasks', (t) => t.operatorId === operatorId && t.date === date)
    .sort((a, b) => a.order - b.order);
}

function getTask(taskId) {
  const task = repo.get('tasks', taskId);
  if (!task) throw httpError(404, `Task ${taskId} not found`);
  return task;
}

function nextPendingTask(operatorId) {
  return getTodayTasks(operatorId).find((t) => t.status === 'PENDING' || t.status === 'PAUSED') || null;
}

function activeMinutes(task, now = Date.now()) {
  const running = task.status === 'ACTIVE' && task.lastResumedAt ? now - Date.parse(task.lastResumedAt) : 0;
  return ((task.activeMs || 0) + running) / 60000;
}

function snapshot(machineId) {
  const t = telemetryStore.getLatest(machineId);
  return t
    ? { loadCycles: t.loadCycles, fuelConsumedLitres: t.fuelConsumedLitres, idleTime: t.idleTime }
    : { loadCycles: 0, fuelConsumedLitres: 0, idleTime: 0 };
}

function computeProgress(task, telemetry, now = Date.now()) {
  const cyclesDone = telemetry
    ? Math.max(0, telemetry.loadCycles - (task.baseline?.loadCycles ?? telemetry.loadCycles))
    : task.progress?.cyclesDone || 0;
  const minutes = activeMinutes(task, now);
  const ratePerMin = minutes >= MIN_MINUTES_FOR_RATE && cyclesDone > 0 ? cyclesDone / minutes : null;
  const remaining = Math.max(0, task.targetLoadCycles - cyclesDone);
  const minLeft = ratePerMin ? remaining / ratePerMin : Math.max(0, task.etaMin - minutes);
  const projectedTotalMin = minutes + minLeft;

  return {
    cyclesDone,
    target: task.targetLoadCycles,
    elapsedMin: Number(minutes.toFixed(1)),
    ratePerMin: ratePerMin ? Number(ratePerMin.toFixed(2)) : null,
    minLeft: Math.round(minLeft),
    projectedTotalMin: Math.round(projectedTotalMin),
    basedOn: ratePerMin ? 'LIVE_PACE' : 'PLAN',
    delayRisk: projectedTotalMin > task.etaHighMin,
    targetReached: cyclesDone >= task.targetLoadCycles,
  };
}

function save(task) {
  const saved = repo.put('tasks', task.id, task);
  emit('task:updated', saved);
  return saved;
}

function start(taskId, { machineId, operatorId }) {
  const task = getTask(taskId);
  if (task.operatorId !== operatorId) throw httpError(403, 'Task belongs to another operator');
  if (!['PENDING', 'PAUSED'].includes(task.status)) throw httpError(409, `Task is ${task.status}`);

  const now = new Date().toISOString();
  const resumed = task.status === 'PAUSED';
  const next = {
    ...task,
    status: 'ACTIVE',
    machineId,
    startedAt: task.startedAt || now,
    lastResumedAt: now,
    baseline: task.baseline || snapshot(machineId),
  };
  next.progress = computeProgress(next, telemetryStore.getLatest(machineId));
  audit.log(resumed ? 'TASK_RESUMED' : 'TASK_STARTED', { operatorId, machineId, taskId });
  return save(next);
}

function pause(taskId) {
  const task = getTask(taskId);
  if (task.status !== 'ACTIVE') throw httpError(409, `Task is ${task.status}`);
  const next = {
    ...task,
    status: 'PAUSED',
    activeMs: (task.activeMs || 0) + (Date.now() - Date.parse(task.lastResumedAt)),
    lastResumedAt: null,
  };
  audit.log('TASK_PAUSED', { operatorId: task.operatorId, machineId: task.machineId, taskId });
  return save(next);
}

function finish(taskId, status) {
  const task = getTask(taskId);
  if (!['ACTIVE', 'PAUSED'].includes(task.status)) throw httpError(409, `Task is ${task.status}`);

  const now = Date.now();
  const telemetry = telemetryStore.getLatest(task.machineId);
  const progress = computeProgress(task, telemetry, now);
  const base = task.baseline || {};
  const alertsCount = repo.list(
    'alerts',
    (a) => a.machineId === task.machineId && a.detectedAt >= task.startedAt
  ).length;

  const next = {
    ...task,
    status,
    activeMs: (task.activeMs || 0) + (task.status === 'ACTIVE' ? now - Date.parse(task.lastResumedAt) : 0),
    lastResumedAt: null,
    completedAt: new Date(now).toISOString(),
    progress,
    result: {
      cyclesDone: progress.cyclesDone,
      actualMin: Math.round(progress.elapsedMin),
      predictedMin: task.etaMin,
      fuelUsedL: telemetry ? Number(Math.max(0, telemetry.fuelConsumedLitres - (base.fuelConsumedLitres || 0)).toFixed(2)) : null,
      idleMin: telemetry ? Number(Math.max(0, telemetry.idleTime - (base.idleTime || 0)).toFixed(1)) : null,
      alertsCount,
    },
  };
  audit.log(status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STOPPED', {
    operatorId: task.operatorId,
    machineId: task.machineId,
    taskId,
    result: next.result,
  });
  return save(next);
}

function complete(taskId) {
  return finish(taskId, 'COMPLETED');
}

function stopIncomplete(taskId) {
  return finish(taskId, 'INCOMPLETE');
}

function getActiveTask(operatorId) {
  return repo.list('tasks', (t) => t.operatorId === operatorId && ['ACTIVE', 'PAUSED'].includes(t.status))[0] || null;
}

// Live progress for the active task on this machine. Persisted only when the
// cycle count changes; the socket gets every update.
function onTelemetry(machineId, telemetry) {
  const task = repo.list('tasks', (t) => t.machineId === machineId && t.status === 'ACTIVE')[0];
  if (!task) return;

  // The simulator was restarted and its load-cycle counter reset: re-baseline.
  const rebaselined = task.baseline && telemetry.loadCycles < task.baseline.loadCycles;
  if (rebaselined) {
    task.baseline = { ...task.baseline, loadCycles: telemetry.loadCycles };
  }
  const progress = computeProgress(task, telemetry);
  const next = { ...task, progress };

  if (rebaselined || progress.cyclesDone !== task.progress?.cyclesDone) {
    repo.put('tasks', task.id, next);
  }
  emit('task:updated', next);
}

function history(operatorId, { from, to } = {}) {
  return repo
    .list(
      'tasks',
      (t) =>
        t.operatorId === operatorId &&
        ['COMPLETED', 'INCOMPLETE'].includes(t.status) &&
        (!from || t.date >= from) &&
        (!to || t.date <= to)
    )
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
}

module.exports = {
  today,
  getTodayTasks,
  getTask,
  nextPendingTask,
  getActiveTask,
  start,
  pause,
  complete,
  stopIncomplete,
  onTelemetry,
  history,
  computeProgress,
};
