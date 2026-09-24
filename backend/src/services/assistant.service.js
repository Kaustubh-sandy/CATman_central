const config = require('../config/env');
const operatorService = require('./operator.service');
const machineService = require('./machine.service');
const shiftService = require('./shift.service');
const taskService = require('./task.service');
const alertService = require('./alert.service');
const incidentService = require('./incident.service');
const trainingService = require('./training.service');
const siteService = require('./site.service');
const { computeEnvelope } = require('./safety.engine');
const insights = require('./assistantInsights.service');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_TURNS = 8;
const IDLE_BURN_LPH = 4;
const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi (हिन्दी)', ta: 'Tamil (தமிழ்)' };

// ---------------- Navigation targets (must match frontend/src/assistant/navigation.js) ----------------

const NAV_TARGETS = {
  dashboard: { route: '/', focus: null },
  machine: { route: '/', focus: 'machine' },
  precheck: { route: '/', focus: 'precheck' },
  checklist: { route: '/', focus: 'checklist' },
  tasks: { route: '/', focus: 'tasks' },
  alerts: { route: '/', focus: 'alerts' },
  sos: { route: '/', focus: 'sos' },
  learning: { route: '/learning', focus: null },
  learning_module: { route: '/learning/sim/:moduleId', focus: null },
  history: { route: '/history', focus: null },
  profile: { route: '/profile', focus: null },
  control_room: { route: '/control-room', focus: null },
};

// ---------------- Tools ----------------

function context(operatorId) {
  const operator = operatorService.getById(operatorId);
  const shift = shiftService.getCurrent(operatorId);
  return { operator, shift, machineId: shift?.machineId || operator?.assignedMachineId };
}

function machineSummary(machineId) {
  const view = machineService.getMachineView(machineId);
  if (!view) return { error: `Unknown machine ${machineId}` };
  const t = view.telemetry;
  return {
    machineId,
    connectivity: view.connectivity.status,
    lastSeenAt: view.connectivity.lastSeenAt,
    ...(t
      ? {
          state: t.state,
          engineRpm: t.engineRpm,
          engineTemperatureC: t.engineTemperature,
          hydraulicTemperatureC: t.hydraulicTemperature,
          fuelPercent: view.fuelPercent,
          fuelConsumptionRateLph: t.fuelConsumptionRateLph,
          vibration: t.vibration,
          seatbeltFastened: t.seatbeltStatus,
          operatorPresent: t.operatorPresent,
          hydraulicLockout: t.hydraulicLockout,
          nearestObjectDistanceM: t.nearestObjectDistanceM,
          tiltAngleDeg: t.tiltAngleDeg,
          loadWeightKg: t.loadWeightKg,
          oilPressureKpa: t.oilPressureKpa,
          loadCycles: t.loadCycles,
          normalRanges: { engineTemperatureC: '70-95', hydraulicTemperatureC: '60-90', vibration: '< 0.8', oilPressureKpa: '> 150 when above 800 rpm' },
        }
      : { note: 'No telemetry received yet' }),
  };
}

const TOOLS = {
  getMachineStatus: {
    description: "Live status of a machine: connectivity, state, temperatures, fuel, seatbelt, proximity, tilt, load, oil pressure. Defaults to the operator's current machine.",
    parameters: { type: 'object', properties: { machineId: { type: 'string', description: 'e.g. EXC001' } } },
    run: ({ machineId }, ctx) => machineSummary(machineId || ctx.machineId),
  },
  getActiveAlerts: {
    description: 'Open safety alerts (not yet resolved) with severity, reason and status. Optionally for one machine.',
    parameters: { type: 'object', properties: { machineId: { type: 'string' } } },
    run: ({ machineId }) =>
      alertService.list({ status: 'open', machineId }).map((a) => ({
        alertId: a.id, machineId: a.machineId, rule: a.ruleId, severity: a.severity, status: a.status, reason: a.reason, detectedAt: a.detectedAt,
      })),
  },
  getTodayTasks: {
    description: "The operator's tasks for today with status, targets, planned ETA range and live progress.",
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) =>
      taskService.getTodayTasks(ctx.operator.operatorId).map((t) => ({
        taskId: t.id, title: t.title, zone: t.siteZone, status: t.status, priority: t.priority,
        targetLoadCycles: t.targetLoadCycles, plannedMin: `${t.etaLowMin}-${t.etaHighMin}`,
        progress: t.progress || null, result: t.result || null,
      })),
  },
  getShiftState: {
    description: 'Current shift state (NOT_STARTED, PRECHECK_RUNNING, PRECHECK_PASSED, PRECHECK_FAILED, CHECKLIST_COMPLETE, TASK_ACTIVE, TASK_PAUSED, TASK_COMPLETE, SHIFT_ENDED), machine, checklist items and active task. Use this to tell the operator what to do next.',
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => {
      const s = ctx.shift;
      return {
        state: s.state, machineId: s.machineId, startedAt: s.startedAt, activeTaskId: s.activeTaskId,
        precheckOverall: s.precheck?.overall || null, precheckNeedsAck: !!(s.precheck?.needsAck && !s.precheck?.warningsAcknowledgedAt),
        checklist: Object.fromEntries(Object.entries(s.checklist?.items || {}).map(([k, v]) => [k, v.checked ? 'DONE' : v.rejected ? `REJECTED:${v.rejected.code}` : 'TODO'])),
      };
    },
  },
  getPrecheckResult: {
    description: 'Latest machine pre-check: mode (AUTO/MANUAL), who verified, overall result and each sensor status.',
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => {
      const p = ctx.shift.precheck;
      if (!p) return { note: 'No pre-check run in this shift yet' };
      return {
        status: p.status, mode: p.mode, overall: p.overall, verifiedBy: p.verifiedBy, completedAt: p.completedAt,
        machineOffline: !!p.machineOffline, maintenanceTicketId: p.maintenanceTicketId || null,
        spareMachines: p.spareMachines || [],
        sensors: (p.sensors || []).map((s) => ({ sensor: s.sensor, status: s.status, value: s.value, unit: s.unit, message: s.message, critical: s.critical })),
      };
    },
  },
  getIdleStats: {
    description: 'Idle time and estimated fuel and cost wasted by idling for a machine in the current shift.',
    parameters: { type: 'object', properties: { machineId: { type: 'string' } } },
    run: ({ machineId }, ctx) => {
      const id = machineId || ctx.machineId;
      const view = machineService.getMachineView(id);
      const t = view?.telemetry;
      if (!t) return { note: 'No telemetry yet' };
      const base = ctx.shift.stats?.baseline;
      const idleMin = base ? Math.max(0, t.idleTime - base.idleTime) : null;
      const litres = idleMin !== null ? (idleMin / 60) * IDLE_BURN_LPH : null;
      return {
        machineId: id, state: t.state, idleMinutesThisShift: idleMin !== null ? Number(idleMin.toFixed(1)) : 'shift not started',
        totalIdleMinutesOnMachine: t.idleTime,
        estimatedIdleFuelL: litres !== null ? Number(litres.toFixed(2)) : null,
        estimatedIdleCostInr: litres !== null ? Math.round(litres * config.fuelPriceInr) : null,
      };
    },
  },
  getIncidents: {
    description: 'List of incidents (SOS calls, critical safety incidents, maintenance tickets) for this operator. Filter by type (SOS, SAFETY_ALERT, MAINTENANCE) and number of days back. Set allOperators for the whole site.',
    parameters: { type: 'object', properties: { type: { type: 'string' }, days: { type: 'number' }, allOperators: { type: 'boolean' } } },
    run: ({ type, days = 7, allOperators = false }, ctx) =>
      incidentService
        .list({ type, operatorId: allOperators ? undefined : ctx.operator.operatorId, since: new Date(Date.now() - days * 86400000).toISOString() })
        .slice(0, 20)
        .map((i) => ({ id: i.id, type: i.type, status: i.status, machineId: i.machineId, rule: i.ruleId || null, reason: i.reason || null, createdAt: i.createdAt })),
  },
  getTrainingModules: {
    description: "3D simulator training modules with the operator's progress (attempts, passed, best score).",
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => {
      const progress = trainingService.progress(ctx.operator.operatorId);
      return trainingService.listModules().map((m) => ({
        moduleId: m.id, title: m.title, skill: m.skill, difficulty: m.difficulty, durationMin: m.durationMin, xp: m.xp,
        teaches: m.summary, objectives: m.objectives,
        ...progress.find((p) => p.moduleId === m.id),
      }));
    },
  },
  getTrainingRecommendations: {
    description: 'Training modules recommended for this operator and why (based on their safety alerts this week).',
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) =>
      trainingService.recommend(ctx.operator.operatorId).map((r) => ({ moduleId: r.moduleId, title: r.module?.title, reason: r.reasonCode, ...r.params })),
  },
  getShiftSummary: {
    description: 'Summary of the last finished shift: tasks done, fuel used, idle minutes, alerts, safety score, XP.',
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => (ctx.shift.summary ? ctx.shift.summary : { note: `Shift not ended yet (state ${ctx.shift.state})` }),
  },
  getOperatorProfile: {
    description: "Operator's name, experience, XP, level, badges.",
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => ({ ...operatorService.withLevel(ctx.operator), badges: trainingService.badges(ctx.operator.operatorId).filter((b) => b.earned).map((b) => b.id) }),
  },
  getSiteConditions: {
    description: 'Weather, visibility and temperature on site, plus the current safe distance around the machine and why.',
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => {
      const site = siteService.get();
      const t = machineService.getMachineView(ctx.machineId)?.telemetry || {};
      return { ...site, safetyEnvelope: computeEnvelope(t, site) };
    },
  },
  getWorkSummary: {
    description:
      "Summary of the operator's work for a period: tasks (done, open, cycles, actual vs planned minutes, fuel, idle, alerts per task), finished shifts (safety score, seatbelt %, fuel, XP), alerts by severity and rule, incidents and notable log events (failed pre-checks, manual overrides, checklist mismatches, escalations, SOS). Use for 'summarise today', 'how did my shift go', 'what did I do this week'.",
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'yesterday', 'week', 'shift'], description: 'Default today' } },
    },
    run: ({ period }, ctx) => insights.summarizeWork(ctx.operator.operatorId, { period }),
  },
  getIncidentSummary: {
    description:
      'What happened in one incident: type, rule, reason, timeline (raised, escalated, acknowledged by whom, resolved), and black-box facts around the event (seatbelt, nearest person, speed, temperatures, impact). Without incidentId it uses the latest incident of this operator.',
    parameters: { type: 'object', properties: { incidentId: { type: 'string', description: 'e.g. INC-..., SOS-..., MNT-...' } } },
    run: ({ incidentId }, ctx) => insights.summarizeIncident(ctx.operator.operatorId, { incidentId }),
  },
  getImprovementPlan: {
    description:
      "How the operator can improve their safety score and skills: this shift's score and where points were lost, weakest skills with the metric behind each penalty, repeated alerts this week, a concrete action for each, points at stake, and recommended training. Use for 'how do I improve', 'why is my score low', 'what am I doing wrong'.",
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => insights.improvementPlan(ctx.operator.operatorId),
  },
  getReminders: {
    description:
      "Things that need the operator's attention now, most important first: unacknowledged alerts, open SOS, seatbelt open, next shift step (pre-check, warnings, checklist, start/resume task, end shift), task behind plan, break due, long idling, low fuel, weather, open maintenance ticket, training to do while parked.",
    parameters: { type: 'object', properties: {} },
    run: (args, ctx) => insights.reminders(ctx.operator.operatorId),
  },
  navigate: {
    description:
      'Open a screen or section of the operator app for the user. Call this whenever the user wants to see, open, go to, start, or do something that lives on a screen (e.g. "run pre-check", "show my alerts", "start seatbelt training", "open task history").',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: Object.keys(NAV_TARGETS) },
        moduleId: { type: 'string', description: 'Required when target is learning_module, e.g. SIM_STARTUP' },
      },
      required: ['target'],
    },
    run: ({ target, moduleId }, ctx) => {
      const nav = NAV_TARGETS[target];
      if (!nav) return { error: `Unknown target ${target}` };
      if (target === 'learning_module' && !trainingService.getModule(moduleId)) return { error: `Unknown module ${moduleId}` };
      const action = { type: 'navigate', target, route: nav.route.replace(':moduleId', moduleId || ''), focus: nav.focus, moduleId: moduleId || null };
      ctx.actions.push(action);
      return { ok: true, opened: target };
    },
  },
};

function runTool(name, args, ctx) {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool ${name}` };
  try {
    return tool.run(args || {}, ctx);
  } catch (err) {
    return { error: err.message };
  }
}

// ---------------- Gemini ----------------

function systemPrompt(ctx, language) {
  return [
    `You are the in-cab assistant for a Caterpillar excavator operator: ${ctx.operator.name} (${ctx.operator.operatorId}), working on machine ${ctx.machineId}.`,
    `The current time is ${new Date().toLocaleString('en-IN')}.`,
    `Always reply in ${LANGUAGE_NAMES[language] || 'English'}. Keep replies to 1-3 short sentences, plain words, numbers with units. No markdown. For a summary, an improvement plan or reminders you may use up to 6 short lines starting with "• ".`,
    'Use the tools for ANY fact about the machine, alerts, tasks, shift, pre-check, training, incidents or site. Never guess values.',
    'When the user wants to see, open, start or do something that lives on a screen, call navigate as well as answering.',
    'For training requests, pick the module whose objectives match (e.g. seatbelt / start-up → SIM_STARTUP, people near the machine → SIM_PROXIMITY_RAIN, overheating → SIM_OVERHEAT, parking / idling → SIM_SHUTDOWN) and navigate to learning_module with that moduleId.',
    'The dashboard flow is: run machine pre-check → safety checklist (seatbelt checked by sensor, horn tested by machine) → start task → complete task → end shift.',
    'Summaries (today, a shift, the week): call getWorkSummary. Lead with tasks done and time vs plan, then safety (alerts, seatbelt %), then anything unusual (incidents, failed pre-check, escalations). If nothing happened, say so.',
    'About one incident ("what happened", "why did the alarm go off"): call getIncidentSummary and explain the cause from the black-box facts, who responded, and what to do next time.',
    'Improving score, skills or behaviour: call getImprovementPlan. Give the 2-3 actions with the most points at stake, say how many points each costs, and offer the recommended training (navigate to learning_module).',
    'Reminders or "what should I remember / anything I missed": call getReminders and list them by priority. When answering "what do I do next", also check getReminders.',
    'Coach, do not scold: say what went well before what to fix.',
    'Times in tool results: always say the *Local field (e.g. atLocal "24 Sept, 11:07"); the plain ISO timestamps are UTC.',
    'Pick the tool by meaning, in any language: improve / better / score / सुधार / बेहतर / स्कोर / மேம்படுத்த / மதிப்பெண் → getImprovementPlan; summary / सारांश / आज क्या किया / சுருக்கம் → getWorkSummary; remind / याद / நினைவூட்டு → getReminders; what happened / क्या हुआ / என்ன நடந்தது → getIncidentSummary.',
    'navigate only opens a screen: always answer the question in words as well.',
    'Name training modules by their title (e.g. "End-of-shift shutdown"), never by their moduleId.',
    'If no tool covers the question, say you do not have that information. Never tell the operator to ignore a safety alert.',
    'In an emergency tell them to hold the red SOS button for 2 seconds.',
  ].join('\n');
}

async function callGemini(model, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.gemini.timeoutMs);
  try {
    const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `Gemini HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// A model that answered "quota exceeded" (HTTP 429) is skipped for a while, so each
// question doesn't wait on calls that are sure to fail before reaching a working model.
const QUOTA_COOLDOWN_MS = 60 * 1000;
const coolingUntil = new Map(); // model -> ms

function availableModels() {
  const now = Date.now();
  const ready = config.gemini.models.filter((m) => (coolingUntil.get(m) || 0) <= now);
  return ready.length ? ready : [...config.gemini.models];
}

async function chatWithGemini(message, history, ctx, language) {
  const functionDeclarations = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, parameters: t.parameters }));
  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let models = availableModels();
  let lastError = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let json = null;
    while (models.length && !json) {
      try {
        json = await callGemini(models[0], {
          systemInstruction: { parts: [{ text: systemPrompt(ctx, language) }] },
          contents,
          tools: [{ functionDeclarations }],
        });
      } catch (err) {
        lastError = err;
        console.warn(`[Assistant] ${models[0]} failed: ${err.message.slice(0, 120)}`);
        if (err.status === 429) coolingUntil.set(models[0], Date.now() + QUOTA_COOLDOWN_MS);
        models = models.slice(1);
      }
    }
    if (!json) throw lastError || new Error('No Gemini model available');

    const parts = json.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      return { reply: text || '…', model: models[0] };
    }

    // Echo the model turn verbatim (it carries thought signatures), then answer each call.
    contents.push({ role: 'model', parts });
    contents.push({
      role: 'user',
      parts: calls.map((c) => {
        ctx.toolCalls.push(c.functionCall.name);
        return {
          functionResponse: {
            name: c.functionCall.name,
            ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
            response: { result: runTool(c.functionCall.name, c.functionCall.args, ctx) },
          },
        };
      }),
    });
  }
  return { reply: 'Sorry, that took too many steps. Please ask again more simply.', model: models[0] };
}

// ---------------- Offline fallback ----------------

function fmtSummary(s) {
  const topRule = Object.entries(s.alerts.byRule).sort((a, b) => b[1] - a[1])[0];
  const lines = [
    `• ${s.period}: ${s.tasks.completed} task(s) done (${s.tasks.onTime} on time), ${s.tasks.incomplete} incomplete, ${s.tasks.stillOpen} still open; ${s.tasks.totalCycles} cycles, ${s.tasks.totalFuelL} L fuel.`,
    `• Alerts: ${s.alerts.total}${topRule ? ` (${Object.entries(s.alerts.bySeverity).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}); most often ${topRule[0]}` : ''}.`,
  ];
  if (s.currentShift.safetyScore !== undefined) lines.push(`• This shift: safety score ${s.currentShift.safetyScore}, seatbelt ${s.currentShift.seatbeltCompliancePct ?? '—'}%.`);
  s.shifts.slice(0, 2).forEach((sh) => lines.push(`• Shift ended ${sh.endedAtLocal}: score ${sh.safetyScore}, ${sh.tasksDone} task(s), ${sh.fuelUsedL} L.`));
  if (s.incidents.length) lines.push(`• Incidents: ${s.incidents.map((i) => `${i.type}${i.rule ? ` ${i.rule}` : ''} (${i.status})`).join(', ')}.`);
  if (s.notableEvents.length) lines.push(`• Also: ${[...new Set(s.notableEvents.map((e) => e.type))].join(', ')}.`);
  return lines.join('\n');
}

function fmtPlan(p) {
  const lines = [];
  if (p.currentShift.safetyScore !== undefined) lines.push(`• Safety score this shift: ${p.currentShift.safetyScore}.`);
  p.actions.slice(0, 3).forEach((a) => lines.push(`• ${a.evidence}${a.pointsAtStake ? ` (−${a.pointsAtStake})` : ''}: ${a.action || 'see training'}`));
  if (!p.actions.length) lines.push('• No points lost — keep it up.');
  if (p.training[0]) lines.push(`• Training: ${p.training[0].title}.`);
  return lines.join('\n');
}

function fmtIncident(i) {
  if (i.note) return i.note;
  const b = i.blackBox?.atEvent;
  return [
    `• ${i.type}${i.rule ? ` ${i.rule}` : ''} on ${i.machineId} at ${i.atLocal} — ${i.reason || ''} (${i.status}).`,
    b ? `• At that moment: ${b.state}, seatbelt ${b.seatbeltFastened ? 'on' : 'OFF'}, nearest object ${b.nearestObjectM} m, ${b.engineTemperatureC} °C.` : null,
    `• ${i.timeline.map((x) => `${x.step.toLowerCase()} ${x.atLocal}${x.by && x.by !== 'SYSTEM' ? ` by ${x.by}` : ''}`).join(' → ')}.`,
    i.whatToDo ? `• Next time: ${i.whatToDo}` : null,
  ].filter(Boolean).join('\n');
}

const REMINDER_TEXT = {
  ALERT_UNACKED: (p) => `Acknowledge the ${p.ruleId} alert`,
  SOS_OPEN: () => 'Your SOS is open — cancel it if you are safe',
  SEATBELT_OPEN: () => 'Fasten your seatbelt',
  RUN_PRECHECK: () => 'Run the machine pre-check',
  PRECHECK_FAILED: (p) => `Pre-check failed — ticket ${p.ticketId}, spare machine ${p.spare}`,
  ACK_WARNINGS: (p) => `Acknowledge pre-check warnings (${p.sensors})`,
  CHECKLIST_LEFT: (p) => `${p.count} checklist item(s) left`,
  RESUME_TASK: (p) => `Resume "${p.title}"`,
  TARGET_REACHED: (p) => `Target reached — complete "${p.title}"`,
  TASK_BEHIND: (p) => `"${p.title}" is about ${p.minutes} min behind plan`,
  START_TASK: (p) => `Start "${p.title}"`,
  END_SHIFT: () => 'All tasks done — end the shift with a handover note',
  BREAK_DUE: (p) => `${p.hours} h without a break — take 10 minutes`,
  IDLE_LONG: (p) => `Idling for ${p.minutes} min — switch off if waiting`,
  LOW_FUEL: (p) => `Fuel at ${p.pct}% — plan a refuel`,
  WEATHER: (p) => `${p.weather}: keep people at least ${p.criticalM} m away`,
  MAINTENANCE_OPEN: (p) => `Maintenance ticket ${p.ticketId} is open for this machine`,
  TRAINING: (p) => `Training suggested: ${p.title}`,
};

const INTENTS = [
  { match: /summar|recap|how did (my|the) (day|shift)|today'?s (task|work)|what did i do|सारांश|आज का|சுருக்க|இன்று/i, run: (ctx, message) => {
      const period = /week|हफ्त|सप्ताह|வாரம்/i.test(message) ? 'week' : /yesterday|कल|நேற்று/i.test(message) ? 'yesterday' : 'today';
      runTool('navigate', { target: 'history' }, ctx);
      return fmtSummary(runTool('getWorkSummary', { period }, ctx));
    } },
  { match: /improve|better|my score|score low|doing wrong|सुधार|बेहतर|स्कोर|மேம்படுத்த|மதிப்பெண்/i, run: (ctx) => {
      const plan = runTool('getImprovementPlan', {}, ctx);
      if (plan.training?.[0]) runTool('navigate', { target: 'learning_module', moduleId: plan.training[0].moduleId }, ctx);
      return fmtPlan(plan);
    } },
  { match: /remind|reminder|forget|missed|याद|भूल|நினைவூட்ட|மறந்த/i, run: (ctx) => {
      const list = runTool('getReminders', {}, ctx);
      return list.length ? list.slice(0, 6).map((r) => `• ${REMINDER_TEXT[r.code] ? REMINDER_TEXT[r.code](r.params) : r.code}`).join('\n') : 'Nothing needs your attention right now.';
    } },
  { match: /what happened|incident|why did .*(alarm|alert)|क्या हुआ|घटना|என்ன நடந்த|சம்பவ/i, run: (ctx, message) => {
      const id = (message.match(/\b(INC|SOS|MNT)-[A-Z0-9]+\b/i) || [])[0];
      return fmtIncident(runTool('getIncidentSummary', { incidentId: id ? id.toUpperCase() : undefined }, ctx));
    } },
  { match: /sos|emergency|help me|accident|injur|आपात|मदद|உதவி|அவசர/i, run: (ctx) => { runTool('navigate', { target: 'sos' }, ctx); return 'In an emergency hold the red SOS button for 2 seconds. Your supervisor gets your location.'; } },
  { match: /pre.?check|sensor|प्री|சோதனை/i, run: (ctx) => {
      runTool('navigate', { target: 'precheck' }, ctx);
      const p = runTool('getPrecheckResult', {}, ctx);
      return p.overall ? `Last pre-check: ${p.overall} (${p.mode}). ${p.sensors.filter((s) => s.status !== 'OK').map((s) => `${s.sensor} ${s.status}`).join(', ') || 'All sensors OK.'}` : 'No pre-check yet. Tap "Run Machine Pre-Check" on the dashboard.';
    } },
  { match: /checklist|seatbelt|belt|horn|सीट|பெல்ட்/i, run: (ctx) => { runTool('navigate', { target: 'checklist' }, ctx); const s = runTool('getShiftState', {}, ctx); return `Shift is ${s.state}. Checklist: ${Object.entries(s.checklist).map(([k, v]) => `${k} ${v}`).join(', ')}.`; } },
  { match: /alert|warning|danger|alarm|चेतावनी|எச்சரிக்கை/i, run: (ctx) => { runTool('navigate', { target: 'alerts' }, ctx); const a = runTool('getActiveAlerts', {}, ctx); return a.length ? `${a.length} open alert(s): ${a.slice(0, 3).map((x) => `${x.severity} ${x.rule} — ${x.reason}`).join('; ')}.` : 'No open alerts.'; } },
  { match: /task|job|next|eta|काम|பணி/i, run: (ctx) => { runTool('navigate', { target: 'tasks' }, ctx); const t = runTool('getTodayTasks', {}, ctx); const next = t.find((x) => ['ACTIVE', 'PAUSED', 'PENDING'].includes(x.status)); return next ? `${next.status === 'PENDING' ? 'Next' : 'Current'} task: ${next.title} (${next.zone}), ${next.progress ? `${next.progress.cyclesDone}/${next.targetLoadCycles} cycles, ${next.progress.minLeft} min left` : `planned ${next.plannedMin} min`}.` : 'No tasks left today.'; } },
  { match: /idle|fuel|diesel|ईंधन|எரிபொருள்/i, run: (ctx) => { const i = runTool('getIdleStats', {}, ctx); const m = runTool('getMachineStatus', {}, ctx); return `Fuel ${m.fuelPercent ?? '—'}%, burning ${m.fuelConsumptionRateLph ?? '—'} L/h. Idle this shift: ${i.idleMinutesThisShift ?? '—'} min.`; } },
  { match: /train|learn|lesson|module|simulat|course|प्रशिक्षण|பயிற்சி/i, run: (ctx) => { const r = runTool('getTrainingRecommendations', {}, ctx)[0]; if (r) { runTool('navigate', { target: 'learning_module', moduleId: r.moduleId }, ctx); return `Try "${r.title}" next.`; } runTool('navigate', { target: 'learning' }, ctx); return 'All modules done — well done. Open E-Learning to replay.'; } },
  { match: /history|past|previous|इतिहास|வரலாறு/i, run: (ctx) => { runTool('navigate', { target: 'history' }, ctx); return 'Opening your task history.'; } },
  { match: /profile|xp|level|badge|प्रोफ़ाइल|சுயவிவர/i, run: (ctx) => { runTool('navigate', { target: 'profile' }, ctx); const p = runTool('getOperatorProfile', {}, ctx); return `${p.name}: level ${p.level}, ${p.xp} XP.`; } },
  { match: /weather|rain|site|visib|मौसम|வானிலை/i, run: (ctx) => { const s = runTool('getSiteConditions', {}, ctx); return `${s.weather}, ${s.ambientTempC} °C, visibility ${s.visibility}. Keep people at least ${s.safetyEnvelope.criticalM} m away.`; } },
  { match: /temp|hot|heat|status|machine|engine|health|मशीन|இயந்திர/i, run: (ctx) => { runTool('navigate', { target: 'machine' }, ctx); const m = runTool('getMachineStatus', {}, ctx); return m.engineTemperatureC !== undefined ? `${m.machineId} is ${m.connectivity}, ${m.state}. Engine ${m.engineTemperatureC} °C, hydraulic ${m.hydraulicTemperatureC} °C, fuel ${m.fuelPercent}%.` : `${m.machineId} is ${m.connectivity}. No live data yet.`; } },
];

function chatOffline(message, ctx) {
  const intent = INTENTS.find((i) => i.match.test(message));
  if (!intent) {
    return 'I can answer about your machine, alerts, tasks, pre-check, training, idle time and site conditions, summarise your day, explain an incident, give reminders and tell you how to improve your score.';
  }
  return intent.run(ctx, message);
}

// ---------------- Entry point ----------------

async function chat({ operatorId, message, history = [], language }) {
  const base = context(operatorId);
  if (!base.operator) {
    const err = new Error('Operator not found');
    err.status = 404;
    throw err;
  }
  const lang = language || base.operator.language || 'en';
  const ctx = { ...base, actions: [], toolCalls: [] };

  if (config.gemini.apiKey) {
    try {
      const { reply, model } = await chatWithGemini(message, history, ctx, lang);
      return { reply, actions: ctx.actions, toolCalls: ctx.toolCalls, mode: 'gemini', model };
    } catch (err) {
      console.warn(`[Assistant] Gemini unavailable, using offline mode: ${err.message.slice(0, 160)}`);
      ctx.actions = [];
      ctx.toolCalls = [];
    }
  }
  const reply = chatOffline(message, ctx);
  return { reply, actions: ctx.actions, toolCalls: ctx.toolCalls, mode: 'offline' };
}

module.exports = { chat, NAV_TARGETS, TOOLS, REMINDER_TEXT };
