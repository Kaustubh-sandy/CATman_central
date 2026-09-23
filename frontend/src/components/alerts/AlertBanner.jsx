import { useEffect, useRef } from 'react';
import { AlertOctagon, BellRing } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import { alertText } from './alertText';
import { playAlarm, speak, vibrate } from '../../utils/alarm';
import { speechCode } from '../../i18n';

const REPEAT_MS = 6000;

// Full-width red banner for unacknowledged CRITICAL alerts. It sounds, vibrates and
// reads the alert aloud in the operator's language, and stays until acknowledged.
export default function AlertBanner() {
  const { t, language, openAlerts, actions } = useLive();
  const announced = useRef(new Set());

  const critical = openAlerts
    .filter((a) => a.severity === 'CRITICAL' && ['ALERTED', 'ESCALATED'].includes(a.status))
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  const high = openAlerts.filter((a) => a.severity === 'HIGH' && a.status === 'ALERTED');
  const top = critical[0];

  // Announce each new CRITICAL/HIGH alert once (voice), keep the alarm tone repeating for CRITICAL.
  useEffect(() => {
    [...critical, ...high].forEach((a) => {
      if (announced.current.has(a.id)) return;
      announced.current.add(a.id);
      const { title, reason } = alertText(a, t);
      if (a.severity === 'CRITICAL') {
        playAlarm();
        vibrate();
      }
      speak(`${title}. ${reason}`, speechCode(language));
    });
  }, [critical, high, t, language]);

  const topId = top?.id;
  useEffect(() => {
    if (!topId) return undefined;
    const id = setInterval(() => {
      playAlarm();
      vibrate();
    }, REPEAT_MS);
    return () => clearInterval(id);
  }, [topId]);

  if (!top) return null;
  const { title, reason } = alertText(top, t);

  return (
    <div role="alert" className="bg-danger text-white border-b-4 border-black px-4 py-3 flex items-center gap-4">
      <AlertOctagon size={48} strokeWidth={2.5} className="shrink-0 animate-pulse" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="font-condensed font-bold text-3xl uppercase leading-tight">{title}</div>
        <div className="text-lg">{reason}</div>
        {top.status === 'ESCALATED' && (
          <div className="font-condensed font-bold uppercase flex items-center gap-1">
            <BellRing size={18} strokeWidth={2.5} /> {t('alertStatus.ESCALATED')}
          </div>
        )}
      </div>
      {critical.length > 1 && <div className="font-condensed font-bold text-2xl">+{critical.length - 1}</div>}
      <button
        type="button"
        onClick={() => actions.acknowledgeAlert(top.id)}
        className="shrink-0 h-btn px-6 rounded bg-white text-danger font-condensed font-bold text-2xl uppercase border-4 border-black"
      >
        {t('alerts.ack')}
      </button>
    </div>
  );
}
