import { BrainCircuit, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { useLive } from '../../context/LiveContext';

// "engineTemperature 93.00 vs normal 78.50 (OPERATING)" → translated sensor + numbers.
const REASON = /^(\w+) ([\d.]+) vs normal ([\d.]+) \((\w+)\)$/;
const IDLE = /^idling for ([\d.]+) min$/;

function reasonText(reason, t) {
  const m = reason.match(REASON);
  if (m) {
    const [, sensor, value, normal, state] = m;
    return t('aiHealth.reason', {
      sensor: t(`aiHealth.sensor.${sensor}`),
      value: Number(value).toFixed(1),
      normal: Number(normal).toFixed(1),
      state: t(`machineState.${state}`),
    });
  }
  const idle = reason.match(IDLE);
  return idle ? t('aiHealth.idling', { min: idle[1] }) : reason;
}

// Advisory result of the ML anomaly ensemble for this machine (backend anomalyDetection.service).
// Safety alerts are separate and come only from the rule engine.
export default function AiHealthCard({ machine, compact = false }) {
  const { t } = useLive();
  const a = machine?.anomaly;

  let tone = 'border-border';
  let Icon = BrainCircuit;
  let headline = t('aiHealth.warming');
  const level = a?.level || 'WARMING';
  if (a && level !== 'WARMING') {
    if (level === 'ANOMALY') {
      tone = 'border-warn';
      Icon = AlertTriangle;
      headline = t('aiHealth.unusual', { what: t(`aiHealth.scenario.${a.scenario}`) });
    } else if (level === 'WATCH') {
      tone = 'border-white/40';
      Icon = Eye;
      headline = t('aiHealth.watching');
    } else {
      tone = 'border-ok';
      Icon = CheckCircle2;
      headline = t('aiHealth.normal');
    }
  }

  return (
    <div className={`rounded border-2 ${tone} bg-surface p-4 space-y-2`} aria-live="polite">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-condensed text-label uppercase tracking-wide text-white/60 flex items-center gap-2">
          <BrainCircuit size={18} strokeWidth={2.5} aria-hidden="true" /> {t('aiHealth.title')}
        </div>
        <span className="text-xs font-condensed uppercase text-white/50">{t('aiHealth.advisory')}</span>
      </div>

      <div className={`flex items-center gap-2 font-condensed font-bold text-2xl ${level === 'ANOMALY' ? 'text-warn' : level === 'NORMAL' ? 'text-ok' : 'text-white/80'}`}>
        <Icon size={28} strokeWidth={2.5} aria-hidden="true" />
        {headline}
      </div>

      {a && level !== 'WARMING' && (
        <div className="text-white/70 text-sm">
          {t('aiHealth.score', { pct: Math.round(a.anomaly_probability * 100), votes: a.unsup_votes })}
        </div>
      )}

      {!compact && a?.reasons?.length > 0 && ['ANOMALY', 'WATCH'].includes(level) && (
        <ul className="space-y-1">
          {a.reasons.map((r) => (
            <li key={r} className="text-white/85">• {reasonText(r, t)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
