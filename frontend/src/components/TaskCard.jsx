import { MapPin, Clock, ListChecks, Play, CheckCircle2 } from 'lucide-react';
import { useLive } from '../context/LiveContext';

const PRIORITY_CLASSES = {
  HIGH: 'text-danger border-danger',
  MEDIUM: 'text-warn border-warn',
  LOW: 'text-white/60 border-white/30',
};

const STATUS_CLASSES = {
  ACTIVE: 'text-ok border-ok',
  PAUSED: 'text-warn border-warn',
  COMPLETED: 'text-ok border-ok',
  INCOMPLETE: 'text-white/60 border-white/30',
};

export default function TaskCard({ task, onStart, highlight = false }) {
  const { t } = useLive();
  const done = ['COMPLETED', 'INCOMPLETE'].includes(task.status);

  return (
    <div className={`rounded border-2 bg-surface p-4 ${highlight ? 'border-catYellow' : 'border-border'} ${done ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="font-condensed font-bold text-xl leading-tight">{task.title}</div>
        <div className="flex gap-2 shrink-0">
          {task.status !== 'PENDING' && (
            <span className={`rounded border-2 px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide ${STATUS_CLASSES[task.status]}`}>
              {task.status === 'COMPLETED' && <CheckCircle2 size={14} strokeWidth={2.5} className="inline mr-1 -mt-0.5" />}
              {t(`taskStatus.${task.status}`)}
            </span>
          )}
          <span className={`rounded border-2 px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide ${PRIORITY_CLASSES[task.priority] || PRIORITY_CLASSES.LOW}`}>
            {t(`priority.${task.priority}`)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/70 text-sm mb-3">
        <span className="flex items-center gap-1">
          <MapPin size={16} strokeWidth={2.5} aria-hidden="true" />
          {task.siteZone}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={16} strokeWidth={2.5} aria-hidden="true" />
          {task.scheduledWindow}
        </span>
        <span className="flex items-center gap-1">
          <ListChecks size={16} strokeWidth={2.5} aria-hidden="true" />
          {t('tasks.cycles', { n: task.targetLoadCycles })}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="font-tabular">
          <span className="text-3xl font-condensed font-bold">{t('tasks.planned', { low: task.etaLowMin, high: task.etaHighMin })}</span>
        </div>
        {onStart && (
          <button
            type="button"
            onClick={() => onStart(task.id)}
            className="h-touch px-5 rounded bg-catYellow text-ink font-condensed font-bold text-xl uppercase flex items-center gap-2"
          >
            <Play size={22} strokeWidth={2.5} />
            {t('tasks.start')}
          </button>
        )}
      </div>
    </div>
  );
}
