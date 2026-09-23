import { Users } from 'lucide-react';
import { useLive } from '../../context/LiveContext';

// Safe distance around the machine right now, and why it has that size.
export default function EnvelopeIndicator({ envelope, distanceM }) {
  const { t } = useLive();
  if (!envelope) return null;

  const d = typeof distanceM === 'number' ? distanceM : null;
  const zone = d === null ? 'ok' : d < envelope.criticalM ? 'danger' : d < envelope.warnM ? 'warn' : 'ok';
  const zoneCls = { ok: 'border-ok text-ok', warn: 'border-warn text-warn', danger: 'border-danger text-danger bg-danger/15' }[zone];
  const scaleMax = Math.max(envelope.warnM * 1.5, d || 0);
  const pos = (m) => `${Math.min(100, (m / scaleMax) * 100)}%`;

  return (
    <div id="focus-envelope" className="rounded border-2 border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-condensed text-label uppercase tracking-wide text-white/60 flex items-center gap-2">
          <Users size={20} strokeWidth={2.5} />
          {t('envelope.title')}
        </div>
        {d !== null && (
          <div className={`rounded border-2 px-3 py-1 font-condensed font-bold text-2xl font-tabular ${zoneCls}`}>
            {t('envelope.nearest')} {d.toFixed(1)} m
          </div>
        )}
      </div>

      <div className="relative h-8 rounded border-2 border-border overflow-hidden bg-ok/20">
        <div className="absolute inset-y-0 left-0 bg-warn/40" style={{ width: pos(envelope.warnM) }} />
        <div className="absolute inset-y-0 left-0 bg-danger/60" style={{ width: pos(envelope.criticalM) }} />
        {d !== null && <div className="absolute inset-y-0 w-1.5 bg-white" style={{ left: pos(d) }} aria-hidden="true" />}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-condensed font-bold">
        <span className="text-danger">
          {t('envelope.stop')} {envelope.criticalM} m
        </span>
        <span className="text-warn">
          {t('envelope.warn')} {envelope.warnM} m
        </span>
      </div>
      <div className="mt-1 text-sm text-white/60">
        {[t('envelope.why'), ...envelope.factors.map((f) => t(`envelope.factor.${f.code}`))].join(' · ')}
      </div>
    </div>
  );
}
