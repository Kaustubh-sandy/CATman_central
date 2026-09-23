import { useState } from 'react';
import { X } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import AlertItem from './AlertItem';
import IncidentReplay from './IncidentReplay';

export default function AlertCenter() {
  const { t, myAlerts, alertCenterOpen, setAlertCenterOpen } = useLive();
  const [replayId, setReplayId] = useState(null);

  if (!alertCenterOpen) return null;
  const open = myAlerts.filter((a) => a.status !== 'RESOLVED');
  const closed = myAlerts.filter((a) => a.status === 'RESOLVED').slice(0, 10);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setAlertCenterOpen(false)} aria-hidden="true" />
      <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-md bg-ink border-l-2 border-border flex flex-col" aria-label={t('alerts.center')}>
        <div className="flex items-center justify-between p-4 border-b-2 border-border">
          <div className="font-condensed font-bold text-3xl uppercase">{t('alerts.center')}</div>
          <button type="button" onClick={() => setAlertCenterOpen(false)} className="h-touch w-touch rounded border-2 border-white/40 flex items-center justify-center" aria-label="Close">
            <X size={28} strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {open.length === 0 && <div className="text-white/60 text-lg">{t('alerts.none')}</div>}
          <ul className="space-y-3">
            {open.map((a) => (
              <AlertItem key={a.id} alert={a} onReplay={setReplayId} />
            ))}
          </ul>
          {closed.length > 0 && (
            <ul className="space-y-3 pt-3 border-t-2 border-border">
              {closed.map((a) => (
                <AlertItem key={a.id} alert={a} onReplay={setReplayId} />
              ))}
            </ul>
          )}
        </div>
      </aside>
      {replayId && <IncidentReplay incidentId={replayId} onClose={() => setReplayId(null)} />}
    </>
  );
}
