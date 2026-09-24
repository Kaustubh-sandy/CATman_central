import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { socket } from '../api/socket';
import { deriveFuelPercent } from '../utils/telemetry';
import { translate } from '../i18n';

const LiveContext = createContext(null);
const MAX_ALERTS = 60;
const MAX_INCIDENTS = 40;
const TOAST_MS = 4000;

function upsert(list, item, max) {
  const rest = list.filter((x) => x.id !== item.id);
  return [item, ...rest].slice(0, max);
}

export function LiveProvider({ children }) {
  const [operator, setOperator] = useState(null);
  const [machines, setMachines] = useState([]);
  const [shift, setShift] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [site, setSite] = useState(null);
  const [envelopes, setEnvelopes] = useState({});
  const [behaviour, setBehaviour] = useState(null);
  // Bumped when the skill engine re-scores this operator, so skill pages re-fetch.
  const [skillsVersion, setSkillsVersion] = useState(0);
  const [reminders, setReminders] = useState([]);
  const [idlePrompt, setIdlePrompt] = useState(null);
  const [toast, setToast] = useState(null);
  const [alertCenterOpen, setAlertCenterOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

  const operatorRef = useRef(null);
  operatorRef.current = operator;
  const shiftRef = useRef(null);
  shiftRef.current = shift;

  const language = operator?.language || 'en';
  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const showToast = useCallback((text, tone = 'danger') => setToast({ text, tone, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const loadAll = useCallback(async () => {
    const [op, fleet, sh, tk, al, inc, st, bh] = await Promise.allSettled([
      apiClient.get('/operators/me'),
      apiClient.get('/fleet'),
      apiClient.get('/shift/current'),
      apiClient.get('/tasks/today'),
      apiClient.get('/alerts', { params: { limit: MAX_ALERTS } }),
      apiClient.get('/incidents'),
      apiClient.get('/site/conditions'),
      apiClient.get('/shift/behaviour'),
    ]);
    if (op.status === 'fulfilled') setOperator(op.value.data);
    if (fleet.status === 'fulfilled') setMachines(fleet.value.data.machines);
    if (sh.status === 'fulfilled') setShift(sh.value.data);
    if (tk.status === 'fulfilled') setTasks(tk.value.data.tasks);
    if (al.status === 'fulfilled') setAlerts(al.value.data);
    if (inc.status === 'fulfilled') setIncidents(inc.value.data.slice(0, MAX_INCIDENTS));
    if (st.status === 'fulfilled') setSite(st.value.data);
    if (bh.status === 'fulfilled') setBehaviour(bh.value.data);
  }, []);

  useEffect(() => {
    loadAll();

    const handlers = {
      connect: () => {
        setConnected(true);
        loadAll();
      },
      disconnect: () => setConnected(false),
      'machine:telemetry': (p) =>
        setMachines((prev) =>
          prev.map((m) =>
            m.machineId === p.machineId
              ? { ...m, telemetry: p, fuelPercent: deriveFuelPercent(p), connectivity: { status: 'ONLINE', lastSeenAt: new Date().toISOString() } }
              : m
          )
        ),
      'eta:updated': (e) => setMachines((prev) => prev.map((m) => (m.machineId === e.machineId ? { ...m, eta: e } : m))),
      'machine:connectivity': (u) =>
        setMachines((prev) =>
          prev.map((m) => (m.machineId === u.machineId ? { ...m, connectivity: { status: u.status, lastSeenAt: u.lastSeenAt } } : m))
        ),
      'shift:updated': (s) => {
        if (s.operatorId === operatorRef.current?.operatorId) setShift(s);
      },
      'task:updated': (task) => {
        if (task.operatorId !== operatorRef.current?.operatorId) return;
        setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev.map((x) => (x.id === task.id ? task : x)) : [...prev, task]));
      },
      'alert:new': (a) => setAlerts((prev) => upsert(prev, a, MAX_ALERTS)),
      'alert:updated': (a) => setAlerts((prev) => upsert(prev, a, MAX_ALERTS)),
      'incident:new': (i) => setIncidents((prev) => upsert(prev, i, MAX_INCIDENTS)),
      'incident:updated': (i) => setIncidents((prev) => upsert(prev, i, MAX_INCIDENTS)),
      'site:conditions': (s) => setSite((prev) => ({ ...(prev || {}), ...s })),
      'behaviour:updated': (b) => {
        if (b.operatorId === operatorRef.current?.operatorId) setBehaviour(b);
      },
      'safety:envelope': (e) => setEnvelopes((prev) => ({ ...prev, [e.machineId]: e })),
      'training:idle_prompt': (p) => {
        if (p.machineId === shiftRef.current?.machineId) setIdlePrompt(p);
      },
      'training:idle_prompt_cancel': (p) => setIdlePrompt((cur) => (cur?.machineId === p.machineId ? null : cur)),
      'operator:updated': (op) => {
        if (op.operatorId === operatorRef.current?.operatorId) setOperator(op);
      },
      'xp:awarded': (x) => {
        if (x.operatorId === operatorRef.current?.operatorId && x.amount > 0) {
          setToast({ text: translate(operatorRef.current?.language || 'en', 'xp.awarded', { n: x.amount }), tone: 'ok', id: Date.now() });
        }
      },
      'behavior:loop_closed': (e) => {
        if (e.operatorId === operatorRef.current?.operatorId) setSkillsVersion((v) => v + 1);
        if (e.operatorId === operatorRef.current?.operatorId && e.improved) {
          const skill = translate(operatorRef.current?.language || 'en', `skills.area.${e.skillArea}`);
          setToast({
            text: translate(operatorRef.current?.language || 'en', 'behavior.loopClosed', { skill, delta: e.delta }),
            tone: 'ok',
            id: Date.now(),
          });
          // Relay to BehaviorLoopBanner if mounted.
          if (window.__behaviorLoopHandler) window.__behaviorLoopHandler(e);
        }
      },
      'behavior:skills_updated': (e) => {
        if (e.operatorId === operatorRef.current?.operatorId) setSkillsVersion((v) => v + 1);
      },
    };

    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    return () => Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
  }, [loadAll]);

  // Every mutating call goes through here: errors surface as a toast, not a crash.
  const call = useCallback(
    async (method, url, body) => {
      try {
        const res = await apiClient.request({ method, url, data: body });
        return res.data;
      } catch (err) {
        const data = err.response?.data;
        const text = data?.code && translate(language, `checklist.reject.${data.code}`) !== `checklist.reject.${data.code}`
          ? translate(language, `checklist.reject.${data.code}`)
          : data?.error || err.message || translate(language, 'error.generic');
        showToast(text);
        return null;
      }
    },
    [language, showToast]
  );

  const shiftCall = useCallback(
    async (url, body) => {
      const s = await call('post', url, body);
      if (s) setShift(s);
      return s;
    },
    [call]
  );

  const actions = useMemo(
    () => ({
      runPrecheck: () => shiftCall('/shift/precheck'),
      cancelPrecheck: () => shiftCall('/shift/precheck/cancel'),
      acknowledgeWarnings: () => shiftCall('/shift/precheck/ack-warnings'),
      switchMachine: (machineId) => shiftCall('/shift/switch-machine', { machineId }),
      checkItem: (item, checked) => shiftCall('/shift/checklist/item', { item, checked }),
      testHorn: () => shiftCall('/shift/checklist/horn'),
      completeChecklist: () => shiftCall('/shift/checklist/complete'),
      startTask: (taskId) => shiftCall('/shift/task/start', { taskId }),
      pauseTask: () => shiftCall('/shift/task/pause'),
      resumeTask: () => shiftCall('/shift/task/resume'),
      completeTask: () => shiftCall('/shift/task/complete'),
      endShift: (handoverNote) => shiftCall('/shift/end', { handoverNote }),
      newShift: async () => {
        const s = await shiftCall('/shift/new');
        const tk = await call('get', '/tasks/today');
        if (tk) setTasks(tk.tasks);
        return s;
      },
      acknowledgeAlert: async (id) => {
        const a = await call('post', `/alerts/${id}/ack`);
        if (a) setAlerts((prev) => upsert(prev, a, MAX_ALERTS));
        return a;
      },
      resolveAlert: async (id) => {
        const a = await call('post', `/alerts/${id}/resolve`);
        if (a) setAlerts((prev) => upsert(prev, a, MAX_ALERTS));
        return a;
      },
      sendSos: async (note) => {
        const i = await call('post', '/incidents/sos', { note });
        if (i) setIncidents((prev) => upsert(prev, i, MAX_INCIDENTS));
        return i;
      },
      updateIncident: async (id, action, body) => {
        const i = await call('post', `/incidents/${id}/${action}`, body);
        if (i) setIncidents((prev) => upsert(prev, i, MAX_INCIDENTS));
        return i;
      },
      setLanguage: async (lang) => {
        const op = await call('patch', '/operators/me', { language: lang });
        if (op) setOperator(op);
      },
      dismissIdlePrompt: () => setIdlePrompt(null),
      refresh: loadAll,
    }),
    [shiftCall, call, loadAll]
  );

  const machineId = shift?.machineId || operator?.assignedMachineId || null;
  const machine = machines.find((m) => m.machineId === machineId) || null;
  const myAlerts = alerts.filter((a) => a.machineId === machineId);
  const openAlerts = myAlerts.filter((a) => a.status !== 'RESOLVED');
  const mySos = incidents.find(
    (i) => i.type === 'SOS' && i.operatorId === operator?.operatorId && ['OPEN', 'ACKNOWLEDGED'].includes(i.status)
  );

  // Assistant reminders: polled, and refreshed shortly after anything that changes them.
  const refreshReminders = useCallback(() => {
    apiClient.get('/assistant/reminders').then((res) => setReminders(res.data)).catch(() => {});
  }, []);
  useEffect(() => {
    refreshReminders();
    const id = setInterval(refreshReminders, 20000);
    return () => clearInterval(id);
  }, [refreshReminders]);
  const reminderKey = [
    shift?.id,
    shift?.state,
    Object.values(shift?.checklist?.items || {}).filter((i) => i.checked).length,
    shift?.precheck?.warningsAcknowledgedAt,
    openAlerts.filter((a) => ['ALERTED', 'ESCALATED'].includes(a.status)).length,
    tasks.map((x) => x.status).join(','),
    mySos?.status,
  ].join('|');
  useEffect(() => {
    const id = setTimeout(refreshReminders, 800);
    return () => clearTimeout(id);
  }, [reminderKey, refreshReminders]);

  const value = {
    connected,
    reminders,
    refreshReminders,
    operator,
    language,
    t,
    machines,
    machine,
    machineId,
    shift,
    tasks,
    alerts,
    myAlerts,
    openAlerts,
    incidents,
    mySos,
    site,
    envelope: envelopes[machineId] || null,
    // Only this shift's numbers (a new shift starts from zero).
    behaviour: behaviour && behaviour.shiftId === shift?.id ? behaviour : null,
    skillsVersion,
    idlePrompt,
    toast,
    showToast,
    alertCenterOpen,
    setAlertCenterOpen,
    assistantOpen,
    setAssistantOpen,
    actions,
  };

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>');
  return ctx;
}
