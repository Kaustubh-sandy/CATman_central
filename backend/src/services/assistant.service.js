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
    description: 'Incidents: SOS calls, critical safety incidents and maintenance tickets. Filter by type (SOS, SAFETY_ALERT, MAINTENANCE) and number of days back.',
    parameters: { type: 'object', properties: { type: { type: 'string' }, days: { type: 'number' } } },
    run: ({ type, days = 7 }) =>
      incidentService
        .list({ type, since: new Date(Date.now() - days * 86400000).toISOString() })
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
    `Always reply in ${LANGUAGE_NAMES[language] || 'English'}. Keep replies to 1-3 short sentences, plain words, numbers with units. No markdown.`,
    'Use the tools for ANY fact about the machine, alerts, tasks, shift, pre-check, training, incidents or site. Never guess values.',
    'When the user wants to see, open, start or do something that lives on a screen, call navigate as well as answering.',
    'For training requests, pick the module whose objectives match (e.g. seatbelt / start-up → SIM_STARTUP, people near the machine → SIM_PROXIMITY_RAIN, overheating → SIM_OVERHEAT, parking / idling → SIM_SHUTDOWN) and navigate to learning_module with that moduleId.',
    'The dashboard flow is: run machine pre-check → safety checklist (seatbelt checked by sensor, horn tested by machine) → start task → complete task → end shift.',
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

async function chatWithGemini(message, history, ctx, language) {
  const functionDeclarations = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, parameters: t.parameters }));
  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let models = [...config.gemini.models];
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

const INTENTS = [
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
    return 'I can answer about your machine, alerts, tasks, pre-check, training, idle time and site conditions.';
  }
  return intent.run(ctx);
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

module.exports = { chat, NAV_TARGETS, TOOLS };
