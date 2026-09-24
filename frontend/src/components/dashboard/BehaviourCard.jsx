import { ShieldCheck } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import { alertText } from '../alerts/alertText';

function toneFor(value, good, ok) {
  if (value === null || value === undefined) return 'text-white/60';
  if (value >= good) return 'text-ok';
  return value >= ok ? 'text-warn' : 'text-danger';
}

// Live safety behaviour for this shift (backend behaviour.service): what goes into
// the end-of-shift summary, shown while the operator can still change it.
export default function BehaviourCard() {
  const { t, behaviour } = useLive();
  if (!behaviour) return null;

  const b = behaviour;
  const belt = b.seatbeltCompliancePct;
  const rules = Object.entries(b.byRule || {}).sort((x, y) => y[1] - x[1]);

  return (
    <div className="rounded border-2 border-border bg-surface p-4 space-y-3" aria-live="polite">
      <div className="font-condensed text-label uppercase tracking-wide text-white/60 flex items-center gap-2">
        <ShieldCheck size={18} strokeWidth={2.5} aria-hidden="true" /> {t('behaviour.title')}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="font-condensed text-sm uppercase text-white/60">{t('behaviour.score')}</div>
          <div className={`font-condensed font-bold text-4xl font-tabular ${toneFor(b.safetyScore, 90, 70)}`}>{b.safetyScore}</div>
        </div>
        <div>
          <div className="font-condensed text-sm uppercase text-white/60">{t('behaviour.seatbelt')}</div>
          <div className={`font-condensed font-bold text-4xl font-tabular ${toneFor(belt, 98, 90)}`}>{belt === null ? '—' : `${belt}%`}</div>
        </div>
        <div>
          <div className="font-condensed text-sm uppercase text-white/60">{t('behaviour.alerts')}</div>
          <div className={`font-condensed font-bold text-4xl font-tabular ${b.alerts.critical ? 'text-danger' : b.alerts.total ? 'text-warn' : 'text-ok'}`}>
            {b.alerts.total}
          </div>
        </div>
      </div>

      {b.unbeltedWorkingSec > 0 && (
        <div className="text-danger font-condensed font-bold">{t('behaviour.unbelted', { sec: b.unbeltedWorkingSec })}</div>
      )}

      {rules.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {rules.map(([ruleId, count]) => (
            <li key={ruleId} className="rounded border-2 border-border px-2 py-0.5 text-sm">
              {alertText({ ruleId }, t).title} × {count}
            </li>
          ))}
        </ul>
      )}

      {(b.penalties.alerts > 0 || b.penalties.seatbelt > 0) && (
        <div className="text-sm text-white/60">
          {t('behaviour.penalties', { alerts: b.penalties.alerts, seatbelt: b.penalties.seatbelt })}
        </div>
      )}
    </div>
  );
}
