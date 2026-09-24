// Facts the assistant builds its answers from: work summaries, incident summaries,
// an improvement plan and live reminders. Everything here is deterministic and read-only;
// Gemini only turns these facts into words (and the offline mode formats them directly).

const repo = require('../db/repo');
const audit = require('./audit.service');
const telemetryStore = require('./telemetryStore.service');
const machineService = require('./machine.service');
const shiftService = require('./shift.service');
const taskService = require('./task.service');
const alertService = require('./alert.service');
const incidentService = require('./incident.service');
const trainingService = require('./training.service');
const behaviourService = require('./behaviour.service');
const behaviorEngine = require('./behaviorEngine.service');
const siteService = require('./site.service');
const { computeEnvelope } = require('./safety.engine');

const DAY_MS = 24 * 60 * 60 * 1000;
const BREAK_AFTER_MIN = 120; // remind before the 4 h fatigue alert
const IDLE_REMINDER_MIN = 5;
const LOW_FUEL_PCT = 15;
const NOTABLE_EVENTS = new Set([
  'PRECHECK_FAILED', 'PRECHECK_MANUAL_OVERRIDE', 'PRECHECK_WARNINGS_ACKNOWLEDGED', 'CHECKLIST_MISMATCH',
  'ALERT_ESCALATED', 'SOS_RAISED', 'MAINTENANCE_TICKET_CREATED', 'MACHINE_SWITCHED', 'TRAINING_COMPLETED',
]);
const SEVERITY_POINTS = behaviourService.PENALTY; // { CRITICAL: 15, HIGH: 8, MEDIUM: 3 }

// What to do about each alert rule and each skill metric. Plain, practical actions.
const RULE_TIPS = {
  SEATBELT_VIOLATION: 'Fasten the seatbelt before starting the engine and keep it on until the hydraulics are locked.',
  PROXIMITY_CRITICAL: 'Stop all movement and sound the horn as soon as anyone enters the swing area; wait for eye contact.',
  PROXIMITY_WARNING: 'Watch the mirrors and camera and slow down when people are near; in rain or fog the stop zone is 1.5× larger.',
  UNATTENDED_MACHINE: 'Lower the bucket, lock the hydraulics and switch off before leaving the seat.',
  LOCKOUT_NOT_ENGAGED: 'Pull the hydraulic lockout lever every time you leave the seat.',
  ROLLOVER_RISK: 'Keep the bucket low when moving and avoid working across slopes.',
  OVERLOAD: 'Take smaller bucket loads and stay under the rated capacity.',
  OVERHEATING: 'Idle down to cool the engine; check coolant and radiator during the walk-around.',
  LOW_OIL_PRESSURE: 'Stop the engine and report it; check the oil level during the walk-around.',
  HIGH_VIBRATION: 'Move the joysticks smoothly; report vibration that does not go away.',
  IMPACT: 'Slow down near trucks and obstacles and use the camera before swinging.',
  FATIGUE: 'Take a 10-minute break every 2 hours.',
};
const METRIC_TIPS = {
  idleRatio: 'Switch the engine off if you will wait more than 5 minutes.',
  unjustifiedIdleRatio: 'Avoid idling between tasks; park, lock and switch off instead.',
  idleFuelRatio: 'Less idling means less fuel wasted; switch off during long waits.',
  fuelPerCycleRatio: 'Use a lower throttle for light digging and avoid over-revving.',
  rpmVarianceRatio: 'Keep a steady engine speed instead of revving up and down.',
  vibrationRatio: 'Operate smoothly and avoid hitting the bucket against hard ground.',
  impactRate: 'Slow down near obstacles and trucks.',
  safetyEventsPerHour: 'Fewer safety alerts: belt on, watch the swing area, lock out when leaving the seat.',
  seatbeltViolations: 'Belt on for every minute the machine is working.',
  proximityEvents: 'Stop and sound the horn when people come near.',
  taskTimeOverrun: 'Position trucks before starting and keep a steady cycle.',
  taskCompletionRate: 'Complete or pause tasks properly before ending the shift.',
  cycleRateVariance: 'Keep a steady loading rhythm.',
};

// ---------------- helpers ----------------

function startOfLocalDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - offsetDays * DAY_MS);
}

function periodRange(period = 'today', shift = null) {
  switch (period) {
    case 'yesterday':
      return { period, from: startOfLocalDay(1).toISOString(), to: startOfLocalDay(0).toISOString() };
    case 'week':
      return { period, from: startOfLocalDay(6).toISOString(), to: null };
    case 'shift':
      return { period, from: shift?.startedAt || shift?.createdAt || startOfLocalDay(0).toISOString(), to: null };
    case 'today':
    default:
      return { period: 'today', from: startOfLocalDay(0).toISOString(), to: null };
  }
}

// Tool results carry UTC timestamps; the *Local fields are what the operator's clock shows.
const localTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null);
const localDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : null);

const inRange = (iso, { from, to }) => !!iso && iso >= from && (!to || iso < to);
const round = (v, d = 1) => (typeof v === 'number' ? Number(v.toFixed(d)) : v);
const countBy = (items, key) => items.reduce((acc, x) => ({ ...acc, [x[key]]: (acc[x[key]] || 0) + 1 }), {});

// ---------------- work summary ----------------

function taskLine(t) {
  const r = t.result || {};
  const p = t.progress || {};
  return {
    taskId: t.id,
    title: t.title,
    zone: t.siteZone,
    status: t.status,
    cycles: r.cyclesDone ?? p.cyclesDone ?? 0,
    targetCycles: t.targetLoadCycles,
    actualMin: r.actualMin ?? p.elapsedMin ?? null,
    plannedMin: `${t.etaLowMin}-${t.etaHighMin}`,
    onTime: r.actualMin !== undefined ? r.actualMin <= t.etaHighMin : null,
    fuelUsedL: r.fuelUsedL ?? null,
    idleMin: r.idleMin ?? null,
    alerts: r.alertsCount ?? null,
    completedAt: t.completedAt || null,
    completedAtLocal: localDateTime(t.completedAt),
  };
}

function summarizeWork(operatorId, { period = 'today' } = {}) {
  const shift = shiftService.getCurrent(operatorId);
  const range = periodRange(period, shift);

  const finished = taskService.history(operatorId).filter((t) => inRange(t.completedAt, range));
  const open = period === 'today' || period === 'shift'
    ? taskService.getTodayTasks(operatorId).filter((t) => ['PENDING', 'ACTIVE', 'PAUSED'].includes(t.status))
    : [];
  const done = finished.filter((t) => t.status === 'COMPLETED');

  const alerts = alertService.list({ operatorId, since: range.from, limit: 500 }).filter((a) => inRange(a.detectedAt, range));
  const incidents = incidentService.list({ operatorId, since: range.from }).filter((i) => inRange(i.createdAt, range));
  const shifts = repo
    .list('shifts', (s) => s.operatorId === operatorId && s.summary && inRange(s.endedAt, range))
    .map((s) => ({ shiftId: s.id, machineId: s.machineId, endedAt: s.endedAt, endedAtLocal: localDateTime(s.endedAt), ...s.summary, tasks: undefined, handoverNote: s.summary.handoverNote || null }));
  const events = audit
    .recent(500)
    .filter((e) => e.operatorId === operatorId && NOTABLE_EVENTS.has(e.type) && inRange(e.at, range))
    .slice(0, 12)
    .map((e) => ({ type: e.type, at: e.at, atLocal: localDateTime(e.at), machineId: e.machineId, detail: e.data?.sensor || e.data?.item || e.data?.ruleId || e.data?.moduleId || null }));

  const live = shift.startedAt && !shift.endedAt ? behaviourService.compute(shift) : null;

  return {
    period: range.period,
    from: range.from,
    to: range.to,
    operatorId,
    tasks: {
      completed: done.length,
      incomplete: finished.length - done.length,
      stillOpen: open.length,
      totalCycles: done.reduce((sum, t) => sum + (t.result?.cyclesDone || 0), 0),
      totalFuelL: round(done.reduce((sum, t) => sum + (t.result?.fuelUsedL || 0), 0), 2),
      totalIdleMin: round(done.reduce((sum, t) => sum + (t.result?.idleMin || 0), 0)),
      onTime: done.filter((t) => t.result && t.result.actualMin <= t.etaHighMin).length,
      list: [...finished, ...open].map(taskLine),
    },
    shifts,
    currentShift: live
      ? { state: shift.state, machineId: shift.machineId, safetyScore: live.safetyScore, seatbeltCompliancePct: live.seatbeltCompliancePct, alerts: live.alerts }
      : { state: shift.state, machineId: shift.machineId },
    alerts: {
      total: alerts.length,
      bySeverity: countBy(alerts, 'severity'),
      byRule: countBy(alerts, 'ruleId'),
      stillOpen: alerts.filter((a) => alertService.OPEN_STATUSES.includes(a.status)).length,
      critical: alerts
        .filter((a) => a.severity === 'CRITICAL')
        .slice(0, 5)
        .map((a) => ({ rule: a.ruleId, at: a.detectedAt, atLocal: localDateTime(a.detectedAt), status: a.status, reason: a.reason })),
    },
    incidents: incidents.slice(0, 8).map((i) => ({ incidentId: i.id, type: i.type, rule: i.ruleId || null, status: i.status, at: i.createdAt, atLocal: localDateTime(i.createdAt), reason: i.reason || null })),
    notableEvents: events,
    note: 'The event log in memory starts at the last backend restart.',
  };
}

// ---------------- incident summary ----------------

function blackBoxFacts(incident) {
  const box = incident.blackBox;
  if (!box) return null;
  const all = [...(box.before || []), ...(box.after || [])];
  if (!all.length) return { samples: 0 };
  const nums = (k) => all.map((t) => t[k]).filter((v) => typeof v === 'number');
  const at = Date.parse(incident.createdAt);
  const atEvent = [...(box.before || [])].reverse()[0] || all[0];
  const min = (a) => (a.length ? Math.min(...a) : null);
  const max = (a) => (a.length ? Math.max(...a) : null);
  return {
    samples: all.length,
    windowSec: box.windowSec,
    complete: box.complete,
    atEvent: {
      state: atEvent.state,
      seatbeltFastened: atEvent.seatbeltStatus,
      operatorPresent: atEvent.operatorPresent,
      nearestObjectM: atEvent.nearestObjectDistanceM,
      speedKph: atEvent.speedKph,
      engineTemperatureC: atEvent.engineTemperature,
      tiltDeg: atEvent.tiltAngleDeg,
      loadKg: atEvent.loadWeightKg,
      secondsBeforeEvent: Math.round((at - Date.parse(atEvent.timestamp)) / 1000),
    },
    window: {
      closestObjectM: min(nums('nearestObjectDistanceM')),
      maxEngineTemperatureC: max(nums('engineTemperature')),
      maxTiltDeg: max(nums('tiltAngleDeg')),
      maxImpactG: max(nums('impactG')),
      maxSpeedKph: max(nums('speedKph')),
      secondsWithBeltOpen: all.filter((t) => t.seatbeltStatus === false).length * 4,
    },
  };
}

function summarizeIncident(operatorId, { incidentId } = {}) {
  let id = incidentId;
  if (!id) {
    const latest = incidentService.list({ operatorId })[0] || incidentService.list({})[0];
    if (!latest) return { note: 'No incidents recorded' };
    id = latest.id;
  }
  const incident = incidentService.get(id);
  const alert = incident.alertId ? repo.get('alerts', incident.alertId) : null;
  return {
    incidentId: incident.id,
    type: incident.type,
    severity: incident.severity,
    rule: incident.ruleId || null,
    reason: incident.reason || incident.note || null,
    machineId: incident.machineId,
    operatorId: incident.operatorId,
    at: incident.createdAt,
    atLocal: localDateTime(incident.createdAt),
    location: incident.location,
    status: incident.status,
    timeline: [
      ...(alert?.history || []).map((h) => ({ step: `ALERT_${h.status}`, by: h.by, at: h.at })),
      { step: `${incident.type}_CREATED`, by: 'SYSTEM', at: incident.createdAt },
      ...(incident.history || []).map((h) => ({ step: `INCIDENT_${h.status}`, by: h.by, at: h.at })),
    ]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((x) => ({ ...x, atLocal: localTime(x.at) })),
    resolutionNote: incident.resolutionNote || alert?.resolution || null,
    failedSensors: incident.failedSensors || null,
    blackBox: blackBoxFacts(incident),
    whatToDo: RULE_TIPS[incident.ruleId] || null,
  };
}

// ---------------- improvement plan ----------------

function improvementPlan(operatorId) {
  const shift = shiftService.getCurrent(operatorId);
  const live = shift.startedAt ? behaviourService.compute(shift) : null;
  const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const weekAlerts = alertService.list({ operatorId, since: weekAgo, limit: 500 });
  const skillsData = behaviorEngine.getSkills(operatorId);
  const recommendations = trainingService.recommend(operatorId).slice(0, 3);

  const actions = [];

  // 1. This shift: alert and seatbelt penalties.
  if (live) {
    Object.entries(live.byRule || {}).forEach(([rule, count]) => {
      const sample = weekAlerts.find((a) => a.ruleId === rule);
      const points = count * (SEVERITY_POINTS[sample?.severity] || 0);
      actions.push({ scope: 'THIS_SHIFT', area: rule, evidence: `${count} ${rule} alert(s) this shift`, pointsAtStake: points, action: RULE_TIPS[rule] || null });
    });
    if (live.penalties.seatbelt > 0) {
      actions.push({
        scope: 'THIS_SHIFT',
        area: 'SEATBELT_COMPLIANCE',
        evidence: `seatbelt worn ${live.seatbeltCompliancePct}% of working time (${live.unbeltedWorkingSec} s without)`,
        pointsAtStake: live.penalties.seatbelt,
        action: RULE_TIPS.SEATBELT_VIOLATION,
      });
    }
  }

  // 2. Across shifts: the weakest skills and what is costing points.
  const skills = skillsData.skills || {};
  Object.entries(skills)
    .filter(([, s]) => s.score < 80)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 2)
    .forEach(([skillId, s]) => {
      (s.penalties || []).forEach((p) => {
        actions.push({
          scope: 'SKILL',
          area: skillId,
          evidence: `${p.metric} ${p.observed} vs your usual ${p.baseline}`,
          pointsAtStake: p.penalty,
          action: METRIC_TIPS[p.metric] || null,
        });
      });
    });

  // 3. This week's most repeated alerts (habits).
  Object.entries(countBy(weekAlerts, 'ruleId'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([rule, count]) => {
      if (actions.some((a) => a.area === rule)) return;
      actions.push({ scope: 'THIS_WEEK', area: rule, evidence: `${count} ${rule} alert(s) in 7 days`, pointsAtStake: null, action: RULE_TIPS[rule] || null });
    });

  actions.sort((a, b) => (b.pointsAtStake || 0) - (a.pointsAtStake || 0));

  return {
    currentShift: live
      ? { safetyScore: live.safetyScore, seatbeltCompliancePct: live.seatbeltCompliancePct, penalties: live.penalties, alerts: live.alerts }
      : { note: 'Shift not started yet' },
    scoreFormula: 'Safety score = 100 − 15 per critical, 8 per high, 3 per medium alert − 0.3 × (100 − seatbelt %)',
    skills: Object.fromEntries(Object.entries(skills).map(([k, s]) => [k, { score: s.score, label: s.label, trend: s.trend }])),
    skillsNote: skillsData.skills ? null : `Skill scores appear after ${skillsData.minShiftsRequired} shifts of at least 10 minutes`,
    actions: actions.slice(0, 6),
    training: recommendations.map((r) => ({ moduleId: r.moduleId, title: r.module?.title, reason: r.reasonCode, ...r.params })),
  };
}

// ---------------- reminders ----------------

function idleMinutes(machineId) {
  const history = telemetryStore.getHistory(machineId);
  let first = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const t = history[i];
    if (t.state !== 'IDLE' || !(t.engineRpm > 0)) break;
    first = t;
  }
  return first ? (Date.now() - Date.parse(first.timestamp)) / 60000 : 0;
}

function reminder(priority, code, params = {}, target = null) {
  return { id: `${code}:${JSON.stringify(params)}`, priority, code, params, target };
}

function reminders(operatorId) {
  const out = [];
  const shift = shiftService.getCurrent(operatorId);
  const machineId = shift.machineId;
  const view = machineId ? machineService.getMachineView(machineId) : null;
  const t = view?.telemetry;

  // Safety first.
  alertService
    .list({ status: 'open', machineId })
    .filter((a) => ['ALERTED', 'ESCALATED'].includes(a.status))
    .slice(0, 3)
    .forEach((a) => out.push(reminder(a.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM', 'ALERT_UNACKED', { ruleId: a.ruleId }, { target: 'alerts' })));

  const sos = incidentService.list({ type: 'SOS', operatorId, status: 'open' })[0];
  if (sos) out.push(reminder('HIGH', 'SOS_OPEN', { status: sos.status }, { target: 'sos' }));

  const working = t && ['OPERATING', 'LOADING', 'UNLOADING', 'TRANSPORTING'].includes(t.state);
  if (working && t.seatbeltStatus === false) out.push(reminder('HIGH', 'SEATBELT_OPEN', {}, { target: 'machine' }));

  // Next step in the shift.
  const p = shift.precheck;
  switch (shift.state) {
    case 'NOT_STARTED':
      out.push(reminder('MEDIUM', 'RUN_PRECHECK', { machineId }, { target: 'precheck' }));
      break;
    case 'PRECHECK_FAILED':
      out.push(reminder('HIGH', 'PRECHECK_FAILED', { ticketId: p?.maintenanceTicketId || '—', spare: p?.spareMachines?.[0]?.machineId || '—' }, { target: 'precheck' }));
      break;
    case 'PRECHECK_PASSED': {
      if (p?.needsAck && !p.warningsAcknowledgedAt) {
        const warn = (p.sensors || []).filter((s) => s.status !== 'OK').map((s) => s.sensor).join(', ');
        out.push(reminder('HIGH', 'ACK_WARNINGS', { sensors: warn }, { target: 'precheck' }));
      }
      const left = Object.entries(shift.checklist?.items || {}).filter(([, v]) => !v.checked).map(([k]) => k);
      if (left.length) out.push(reminder('MEDIUM', 'CHECKLIST_LEFT', { count: left.length }, { target: 'checklist' }));
      break;
    }
    default:
      break;
  }

  const tasks = taskService.getTodayTasks(operatorId);
  const active = tasks.find((x) => x.status === 'ACTIVE' || x.status === 'PAUSED');
  const next = tasks.find((x) => x.status === 'PENDING');
  if (active?.status === 'PAUSED') out.push(reminder('MEDIUM', 'RESUME_TASK', { title: active.title }, { target: 'tasks' }));
  if (active?.progress?.targetReached) out.push(reminder('MEDIUM', 'TARGET_REACHED', { title: active.title }, { target: 'tasks' }));
  else if (active?.progress?.delayRisk) {
    out.push(reminder('MEDIUM', 'TASK_BEHIND', { title: active.title, minutes: Math.max(0, active.progress.projectedTotalMin - active.etaHighMin) }, { target: 'tasks' }));
  }
  if (['CHECKLIST_COMPLETE', 'TASK_COMPLETE'].includes(shift.state)) {
    if (next) out.push(reminder('MEDIUM', 'START_TASK', { title: next.title }, { target: 'tasks' }));
    else out.push(reminder('LOW', 'END_SHIFT', {}, { target: 'dashboard' }));
  }

  // Health, fuel, fatigue, idling, conditions.
  if (shift.activeSince) {
    const minutes = (Date.now() - Date.parse(shift.activeSince)) / 60000;
    if (minutes >= BREAK_AFTER_MIN) out.push(reminder('MEDIUM', 'BREAK_DUE', { hours: round(minutes / 60) }, { target: 'dashboard' }));
  }
  if (machineId) {
    const idle = idleMinutes(machineId);
    if (idle >= IDLE_REMINDER_MIN) out.push(reminder('LOW', 'IDLE_LONG', { minutes: Math.round(idle) }, { target: 'machine' }));
  }
  if (typeof view?.fuelPercent === 'number' && view.fuelPercent < LOW_FUEL_PCT) {
    out.push(reminder('MEDIUM', 'LOW_FUEL', { pct: view.fuelPercent }, { target: 'machine' }));
  }
  const site = siteService.get();
  if (site.weather !== 'CLEAR' || site.visibility === 'LOW') {
    out.push(reminder('LOW', 'WEATHER', { weather: site.weather, criticalM: computeEnvelope(t || {}, site).criticalM }, { target: 'machine' }));
  }
  const ticket = incidentService.list({ type: 'MAINTENANCE', machineId, status: 'open' })[0];
  if (ticket && shift.state !== 'PRECHECK_FAILED') out.push(reminder('LOW', 'MAINTENANCE_OPEN', { ticketId: ticket.id }, { target: 'precheck' }));

  // Learning, only when it is safe to look at the screen.
  const parked = !t || (t.state === 'IDLE' && t.hydraulicLockout === true);
  const rec = trainingService.recommend(operatorId)[0];
  if (rec && parked && !['TASK_ACTIVE'].includes(shift.state)) {
    out.push(reminder('LOW', 'TRAINING', { title: rec.module?.title || rec.moduleId, moduleId: rec.moduleId }, { target: 'learning_module', moduleId: rec.moduleId }));
  }

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

module.exports = { localTime, localDateTime, summarizeWork, summarizeIncident, improvementPlan, reminders, RULE_TIPS, METRIC_TIPS };
