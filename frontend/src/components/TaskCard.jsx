import { MapPin, Clock, ListChecks } from 'lucide-react';

const PRIORITY_CLASSES = {
  HIGH: 'text-danger border-danger',
  MEDIUM: 'text-warn border-warn',
  LOW: 'text-white/60 border-white/30',
};

export default function TaskCard({ task }) {
  return (
    <div className="rounded border-2 border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="font-condensed font-bold text-xl leading-tight">{task.title}</div>
        <span
          className={`shrink-0 rounded border-2 px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide ${
            PRIORITY_CLASSES[task.priority] || PRIORITY_CLASSES.LOW
          }`}
        >
          {task.priority}
        </span>
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
          {task.targetLoadCycles} cycles
        </span>
      </div>

      <div className="font-tabular">
        <span className="text-3xl font-condensed font-bold">
          {task.etaLowMin}–{task.etaHighMin}
        </span>
        <span className="text-white/60 ml-1">min</span>
      </div>
    </div>
  );
}
