const TONE_BAR_CLASSES = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

export default function GaugeBar({ label, Icon, value, unit, max, tone = 'ok' }) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(value);
  const pct = hasValue ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 font-condensed text-label uppercase tracking-wide text-white/70">
          {Icon ? <Icon size={20} strokeWidth={2.5} aria-hidden="true" /> : null}
          {label}
        </span>
        <span className="font-tabular font-bold text-white">
          {hasValue ? Math.round(value) : '—'}
          <span className="text-sm font-normal text-white/60 ml-1">{unit}</span>
        </span>
      </div>
      <div className="h-3 w-full rounded border-2 border-border bg-black/40 overflow-hidden">
        <div
          className={`h-full ${TONE_BAR_CLASSES[tone]} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
