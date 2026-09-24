import { useState } from 'react';
import { ArrowDown, ArrowUp, Brain, HelpCircle } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import { formatRelativeTime } from '../../utils/format';

// ETA and its explanation exactly as returned by backend/src/ml/eta/predict.py.
export default function EtaPanel({ taskId }) {
  const { t, machine } = useLive();
  const [showWhy, setShowWhy] = useState(false);

  const eta = machine?.eta?.taskId === taskId ? machine.eta : null;
  const hasValue = typeof eta?.eta_minutes === 'number';
  const explanation = Array.isArray(eta?.explanation) ? eta.explanation : [];

  const factorLabel = (factor) => {
    const key = `eta.factor.${factor}`;
    const label = t(key);
    return label === key ? factor : label;
  };

  return (
    <div className="rounded border-2 border-border bg-black/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-condensed text-label uppercase tracking-wide text-white/60">
          <Brain size={18} strokeWidth={2.5} aria-hidden="true" />
          {t('eta.title')}
        </div>
        {eta?.predictedAt && (
          <div className="text-sm text-white/50">{t('eta.updated', { when: formatRelativeTime(eta.predictedAt, t) })}</div>
        )}
      </div>

      {hasValue ? (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="font-condensed font-bold text-4xl leading-none font-tabular text-catYellow">
            {t('eta.minutes', { n: eta.eta_minutes })}
          </div>
          <button
            type="button"
            onClick={() => setShowWhy((s) => !s)}
            aria-expanded={showWhy}
            className="inline-flex items-center gap-1 rounded border-2 border-white/40 px-2 py-0.5 font-condensed font-bold uppercase"
          >
            <HelpCircle size={18} strokeWidth={2.5} />
            {t('eta.why')}
          </button>
        </div>
      ) : (
        <div className={`font-condensed font-bold text-xl ${eta?.error ? 'text-warn' : 'text-white/60'}`}>
          {eta?.error ? t('eta.failed') : t('eta.waiting')}
        </div>
      )}

      {hasValue && eta.error && <div className="text-sm text-warn">{t('eta.lastFailed')}</div>}

      {hasValue && showWhy && (
        explanation.length ? (
          <ul className="divide-y-2 divide-border rounded border-2 border-border">
            {explanation.map((f) => {
              const up = f.direction === 'increase';
              return (
                <li key={f.factor} className="flex items-center gap-3 px-3 py-1.5">
                  <span className={`inline-flex items-center gap-1 w-24 shrink-0 font-condensed font-bold font-tabular ${up ? 'text-warn' : 'text-ok'}`}>
                    {up ? <ArrowUp size={18} strokeWidth={2.5} aria-label={t('eta.more')} /> : <ArrowDown size={18} strokeWidth={2.5} aria-label={t('eta.less')} />}
                    {t('eta.minutes', { n: Math.abs(Number(f.impact_minutes)).toFixed(2) })}
                  </span>
                  <span className="text-white/85">{factorLabel(f.factor)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-white/60">{t('eta.noExplanation')}</div>
        )
      )}
    </div>
  );
}
