import { useEffect, useRef } from 'react';
import { AlertOctagon, AlertTriangle, BellRing, ShieldAlert } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import { alertText } from './alertText';
import { playAlarm, speak, vibrate } from '../../utils/alarm';
import { speechCode } from '../../i18n';

const REPEAT_MS = 4000;
const RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
const UNACKED = ['ALERTED', 'ESCALATED'];

const STYLE = {
  CRITICAL: { box: 'alert-blink text-white', Icon: AlertOctagon, button: 'bg-white text-danger' },
  HIGH: { box: 'bg-danger text-white', Icon: ShieldAlert, button: 'bg-white text-danger' },
  MEDIUM: { box: 'bg-warn text-ink', Icon: AlertTriangle, button: 'bg-ink text-warn' },
};

// Top-of-screen banner for every unacknowledged alert on this machine, most severe first.
// CRITICAL: blinking banner, flashing screen edge, alarm + vibration every 4 s until acknowledged.
// HIGH: red banner, one alarm. MEDIUM: amber banner. Every new alert is read aloud once in
// the operator's language. After acknowledging, a slim strip stays while the hazard is still there.
export default function AlertBanner() {
  const { t, language, openAlerts, actions } = useLive();
  const announced = useRef(new Set());

  const unacked = openAlerts
    .filter((a) => UNACKED.includes(a.status) && RANK[a.severity] !== undefined)
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.detectedAt.localeCompare(a.detectedAt));
  const stillActive = openAlerts.filter((a) => a.status === 'ACKNOWLEDGED' && !a.conditionCleared);
  const top = unacked[0];

  useEffect(() => {
    unacked.forEach((a) => {
      if (announced.current.has(a.id)) return;
      announced.current.add(a.id);
      const { title, reason } = alertText(a, t);
      if (a.severity !== 'MEDIUM') {
        playAlarm();
        vibrate();
      }
      speak(`${title}. ${reason}`, speechCode(language));
    });
  }, [unacked, t, language]);

  const criticalId = top?.severity === 'CRITICAL' ? top.id : null;
  useEffect(() => {
    if (!criticalId) return undefined;
    const id = setInterval(() => {
      playAlarm();
      vibrate();
    }, REPEAT_MS);
    return () => clearInterval(id);
  }, [criticalId]);

  if (!top) {
    if (!stillActive.length) return null;
    const first = alertText(stillActive[0], t);
    return (
      <div role="status" className="bg-warn/15 border-b-4 border-warn text-warn px-4 py-2 flex items-center gap-3 font-condensed font-bold uppercase">
        <AlertTriangle size={24} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate">
          {t('alerts.stillActive')}: {first.title}
          {stillActive.length > 1 ? ` +${stillActive.length - 1}` : ''}
        </span>
      </div>
    );
  }

  const { title, reason } = alertText(top, t);
  const style = STYLE[top.severity];
  const { Icon } = style;

  return (
    <>
      {top.severity === 'CRITICAL' && <div className="edge-flash" aria-hidden="true" />}
      <div role="alert" className={`${style.box} border-b-4 border-black px-4 py-3 flex items-center gap-4`}>
        <Icon size={48} strokeWidth={2.5} className="shrink-0 animate-pulse" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="font-condensed font-bold text-3xl uppercase leading-tight">{title}</div>
          <div className="text-lg">{reason}</div>
          {top.status === 'ESCALATED' && (
            <div className="font-condensed font-bold uppercase flex items-center gap-1">
              <BellRing size={18} strokeWidth={2.5} /> {t('alertStatus.ESCALATED')}
            </div>
          )}
        </div>
        {unacked.length > 1 && <div className="font-condensed font-bold text-2xl">+{unacked.length - 1}</div>}
        <button
          type="button"
          onClick={() => actions.acknowledgeAlert(top.id)}
          className={`shrink-0 h-btn px-6 rounded ${style.button} font-condensed font-bold text-2xl uppercase border-4 border-black`}
        >
          {t('alerts.ack')}
        </button>
      </div>
    </>
  );
}
