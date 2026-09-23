import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

const STATUS_MAP = {
  ONLINE: { label: 'ONLINE', tone: 'ok', Icon: CheckCircle2 },
  STALE: { label: 'STALE', tone: 'warn', Icon: AlertTriangle },
  OFFLINE: { label: 'OFFLINE', tone: 'danger', Icon: AlertOctagon },
};

const TONE_CLASSES = {
  ok: 'text-ok border-ok bg-ok/10',
  warn: 'text-warn border-warn bg-warn/10',
  danger: 'text-danger border-danger bg-danger/10',
};

export default function StatusPill({ status, className = '' }) {
  const entry = STATUS_MAP[status] || STATUS_MAP.OFFLINE;
  const { label, tone, Icon } = entry;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded border-2 px-3 py-1.5 font-condensed font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon size={20} strokeWidth={2.5} aria-hidden="true" />
      {label}
    </span>
  );
}
