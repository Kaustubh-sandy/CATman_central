import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useLive } from '../context/LiveContext';

// Transient celebration banner when the behavior loop closes (training led to real improvement).
export default function BehaviorLoopBanner() {
  const { t } = useLive();
  const [event, setEvent] = useState(null);

  useEffect(() => {
    // Listen directly from LiveContext's socket event relay.
    const handler = (e) => setEvent(e);
    window.__behaviorLoopHandler = handler;
    return () => { delete window.__behaviorLoopHandler; };
  }, []);

  useEffect(() => {
    if (!event) return undefined;
    const id = setTimeout(() => setEvent(null), 6000);
    return () => clearTimeout(id);
  }, [event]);

  if (!event) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
      <div className="flex items-center gap-3 rounded-lg border-2 border-ok bg-ok/20 backdrop-blur-lg px-6 py-4 shadow-2xl">
        <Trophy size={32} strokeWidth={2.5} className="text-ok shrink-0" />
        <div className="font-condensed font-bold text-xl text-ok">
          {t('behavior.loopClosed', {
            skill: t(`skills.area.${event.skillArea}`),
            delta: event.delta,
          })}
        </div>
      </div>
    </div>
  );
}
