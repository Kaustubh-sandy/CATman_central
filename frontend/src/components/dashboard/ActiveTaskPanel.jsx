import { useState } from 'react';
import { Pause, Play, CheckCircle2, HelpCircle, TrendingDown, TrendingUp, MapPin } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import PrimaryButton from '../PrimaryButton';
import EtaPanel from './EtaPanel';

function ProgressRing({ value, max }) {
  const size = 150;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${value} of ${max}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3A3A3A" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#FFCD11"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s' }}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontFamily="Barlow Condensed" fontWeight="700" fontSize="44">
        {value}
      </text>
      <text x="50%" y="70%" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.6)" fontFamily="Barlow Condensed" fontSize="20">
        / {max}
      </text>
    </svg>
  );
}

export default function ActiveTaskPanel({ task, paused }) {
  const { t, actions } = useLive();
  const [showWhy, setShowWhy] = useState(false);
  if (!task) return null;
  const p = task.progress || { cyclesDone: 0, minLeft: task.etaMin, basedOn: 'PLAN' };

  return (
    <div id="focus-tasks" className="rounded border-2 border-catYellow bg-surface p-5 space-y-4">
      <div>
        <div className="font-condensed font-bold text-2xl leading-tight">{task.title}</div>
        <div className="text-white/60 flex items-center gap-1">
          <MapPin size={16} strokeWidth={2.5} /> {task.siteZone}
        </div>
      </div>

      <div className="flex items-center gap-5">
        <ProgressRing value={p.cyclesDone} max={task.targetLoadCycles} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="font-condensed text-label uppercase tracking-wide text-white/60">{t('active.cycles')}</div>
          <div className="font-condensed font-bold text-figure leading-none font-tabular">{t('active.minLeft', { n: p.minLeft })}</div>
          <div className="text-white/60">{t('active.planned', { low: task.etaLowMin, high: task.etaHighMin })}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 rounded border-2 px-2 py-0.5 font-condensed font-bold uppercase ${
                p.delayRisk ? 'border-warn text-warn' : 'border-ok text-ok'
              }`}
            >
              {p.delayRisk ? <TrendingDown size={18} strokeWidth={2.5} /> : <TrendingUp size={18} strokeWidth={2.5} />}
              {p.delayRisk ? t('active.delay') : t('active.onTrack')}
            </span>
            <button
              type="button"
              onClick={() => setShowWhy((s) => !s)}
              className="inline-flex items-center gap-1 rounded border-2 border-white/40 px-2 py-0.5 font-condensed font-bold uppercase"
            >
              <HelpCircle size={18} strokeWidth={2.5} />
              {t('active.why')}
            </button>
          </div>
          {showWhy && (
            <div className="rounded border-2 border-border bg-black/30 p-2 text-white/80">
              {p.basedOn === 'LIVE_PACE' ? t('active.whyLive', { rate: p.ratePerMin, elapsed: p.elapsedMin }) : t('active.whyPlan')}
            </div>
          )}
        </div>
      </div>

      <EtaPanel taskId={task.id} />

      {p.targetReached && (
        <div className="rounded border-2 border-ok text-ok p-3 font-condensed font-bold text-xl">{t('active.targetReached')}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {paused ? (
          <PrimaryButton icon={Play} tone="secondary" onClick={actions.resumeTask}>
            {t('active.resume')}
          </PrimaryButton>
        ) : (
          <PrimaryButton icon={Pause} tone="secondary" onClick={actions.pauseTask}>
            {t('active.pause')}
          </PrimaryButton>
        )}
        <PrimaryButton icon={CheckCircle2} onClick={actions.completeTask}>
          {t('active.complete')}
        </PrimaryButton>
      </div>
    </div>
  );
}
