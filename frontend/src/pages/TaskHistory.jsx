import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { apiClient } from '../api/client';
import { useLive } from '../context/LiveContext';
import AlertItem from '../components/alerts/AlertItem';
import IncidentReplay from '../components/alerts/IncidentReplay';

function Metric({ label, value, tone = '' }) {
  return (
    <div>
      <div className="text-xs uppercase text-white/50">{label}</div>
      <div className={`font-condensed font-bold text-2xl font-tabular ${tone}`}>{value}</div>
    </div>
  );
}

function HistoryRow({ task, alerts, onReplay }) {
  const { t } = useLive();
  const [open, setOpen] = useState(false);
  const r = task.result || {};
  const late = r.actualMin > task.etaHighMin;
  const taskAlerts = alerts.filter((a) => a.machineId === task.machineId && a.detectedAt >= task.startedAt && a.detectedAt <= task.completedAt);

  return (
    <li className="rounded border-2 border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left p-4 min-h-touch">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-condensed font-bold text-xl">{task.title}</div>
            <div className="text-sm text-white/60 flex items-center gap-1">
              <MapPin size={14} /> {task.siteZone} · {task.date} · {t(`taskStatus.${task.status}`)}
            </div>
          </div>
          {open ? <ChevronUp size={28} /> : <ChevronDown size={28} />}
        </div>
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Metric label={t('history.planned')} value={`${task.etaLowMin}–${task.etaHighMin}m`} />
          <Metric label={t('history.actual')} value={`${r.actualMin ?? '—'}m`} tone={late ? 'text-warn' : 'text-ok'} />
          <Metric label={t('history.cycles')} value={`${r.cyclesDone ?? 0}/${task.targetLoadCycles}`} />
          <Metric label={t('history.fuel')} value={`${r.fuelUsedL ?? '—'} L`} />
          <Metric label={t('history.idle')} value={`${r.idleMin ?? '—'}m`} />
          <Metric label={t('history.alerts')} value={r.alertsCount ?? 0} tone={r.alertsCount ? 'text-danger' : ''} />
        </div>
      </button>
      {open && (
        <div className="border-t-2 border-border p-4">
          <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('history.incidents')}</div>
          {taskAlerts.length === 0 ? (
            <div className="text-white/60">{t('alerts.none')}</div>
          ) : (
            <ul className="space-y-3">
              {taskAlerts.map((a) => (
                <AlertItem key={a.id} alert={a} onReplay={onReplay} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function TaskHistory() {
  const { t } = useLive();
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [replayId, setReplayId] = useState(null);

  useEffect(() => {
    Promise.all([apiClient.get('/tasks/history'), apiClient.get('/alerts', { params: { limit: 500 } })]).then(([h, a]) => {
      setTasks(h.data.tasks);
      setAlerts(a.data);
    });
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="font-condensed font-bold text-figure uppercase leading-none">{t('history.title')}</div>
      {tasks.length === 0 ? (
        <div className="rounded border-2 border-border bg-surface p-4 text-white/60">{t('history.none')}</div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <HistoryRow key={task.id} task={task} alerts={alerts} onReplay={setReplayId} />
          ))}
        </ul>
      )}
      {replayId && <IncidentReplay incidentId={replayId} onClose={() => setReplayId(null)} />}
    </div>
  );
}
