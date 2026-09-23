import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useLive } from '../context/LiveContext';

const STATUS_MAP = {
  ONLINE: { tone: 'ok', Icon: CheckCircle2 },
  STALE: { tone: 'warn', Icon: AlertTriangle },
  OFFLINE: { tone: 'danger', Icon: AlertOctagon },
};

const TONE_CLASSES = {
  ok: 'text-ok border-ok bg-ok/10',
  warn: 'text-warn border-warn bg-warn/10',
  danger: 'text-danger border-danger bg-danger/10',
};

export default function StatusPill({ status, className = '' }) {
  const { t } = useLive();
  const key = STATUS_MAP[status] ? status : 'OFFLINE';
  const { tone, Icon } = STATUS_MAP[key];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded border-2 px-3 py-1.5 font-condensed font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon size={20} strokeWidth={2.5} aria-hidden="true" />
      {t(`status.${key}`)}
    </span>
  );
}
