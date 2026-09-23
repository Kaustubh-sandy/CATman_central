import { RotateCcw, Award, Fuel, Clock, ShieldCheck, AlertTriangle, ListChecks } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import PrimaryButton from '../PrimaryButton';

function Stat({ Icon, label, value, tone = '' }) {
  return (
    <div className="rounded border-2 border-border p-3">
      <div className="font-condensed text-sm uppercase text-white/60 flex items-center gap-1">
        <Icon size={16} strokeWidth={2.5} /> {label}
      </div>
      <div className={`font-condensed font-bold text-4xl font-tabular ${tone}`}>{value}</div>
    </div>
  );
}

export default function ShiftSummary({ summary }) {
  const { t, actions } = useLive();
  if (!summary) return null;
  const scoreTone = summary.safetyScore >= 90 ? 'text-ok' : summary.safetyScore >= 70 ? 'text-warn' : 'text-danger';

  return (
    <div className="space-y-4">
      <div className="font-condensed text-label uppercase tracking-wide text-white/60">{t('summary.title')}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat Icon={ListChecks} label={t('summary.tasks')} value={summary.tasksDone} />
        <Stat Icon={Fuel} label={t('summary.fuel')} value={`${summary.fuelUsedL} L`} />
        <Stat Icon={Clock} label={t('summary.idle')} value={`${summary.idleMinutes} min`} />
        <Stat Icon={AlertTriangle} label={t('summary.alerts')} value={summary.alerts.total} tone={summary.alerts.critical ? 'text-danger' : ''} />
        <Stat Icon={ShieldCheck} label={t('summary.safety')} value={summary.safetyScore} tone={scoreTone} />
        <Stat Icon={Award} label={t('summary.xp')} value={`+${summary.xpEarned}`} tone="text-catYellow" />
      </div>
      {summary.handoverNote && (
        <div className="rounded border-2 border-border p-3">
          <div className="font-condensed text-sm uppercase text-white/60">{t('summary.handover')}</div>
          <div className="text-lg">{summary.handoverNote}</div>
        </div>
      )}
      <PrimaryButton icon={RotateCcw} onClick={actions.newShift}>
        {t('summary.newShift')}
      </PrimaryButton>
    </div>
  );
}
