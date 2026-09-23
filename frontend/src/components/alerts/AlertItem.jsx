import { useNow } from '../../hooks/useNow';
import { useLive } from '../../context/LiveContext';
import { formatRelativeTime } from '../../utils/format';
import { alertText, SEVERITY_STYLE } from './alertText';

export default function AlertItem({ alert, onReplay }) {
  useNow(5000);
  const { t, actions } = useLive();
  const { title, reason } = alertText(alert, t);
  const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.MEDIUM;
  const open = alert.status !== 'RESOLVED';

  return (
    <li className={`rounded border-2 p-3 ${open ? style.cls.split(' ')[0] : 'border-border opacity-60'} bg-surface`}>
      <div className="flex items-start gap-3">
        <style.Icon className={style.cls.split(' ')[1]} size={28} strokeWidth={2.5} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded px-1.5 font-condensed font-bold text-sm uppercase text-ink ${style.bg}`}>{t(`severity.${alert.severity}`)}</span>
            <span className="font-condensed font-bold text-xl leading-tight">{title}</span>
          </div>
          <div className="text-white/80">{reason}</div>
          <div className="text-sm text-white/50 mt-0.5">
            {alert.machineId} · {formatRelativeTime(alert.detectedAt, t)} · {t(`alertStatus.${alert.status}`)}
            {alert.conditionCleared && open ? ` · ${t('alerts.cleared')}` : ''}
          </div>
        </div>
      </div>
      {(open || (alert.incidentId && onReplay)) && (
        <div className="mt-3 flex gap-2">
          {['ALERTED', 'ESCALATED'].includes(alert.status) && (
            <button
              type="button"
              onClick={() => actions.acknowledgeAlert(alert.id)}
              className="flex-1 h-touch rounded bg-catYellow text-ink font-condensed font-bold text-lg uppercase"
            >
              {t('alerts.ack')}
            </button>
          )}
          {alert.status === 'ACKNOWLEDGED' && (
            <button
              type="button"
              onClick={() => actions.resolveAlert(alert.id)}
              className="flex-1 h-touch rounded border-2 border-white/40 font-condensed font-bold text-lg uppercase"
            >
              {t('alerts.resolve')}
            </button>
          )}
          {alert.incidentId && onReplay && (
            <button
              type="button"
              onClick={() => onReplay(alert.incidentId)}
              className="h-touch px-4 rounded border-2 border-white/40 font-condensed font-bold text-lg uppercase"
            >
              {t('alerts.replay')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
