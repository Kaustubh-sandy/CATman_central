import { useEffect, useRef, useState } from 'react';
import { Siren } from 'lucide-react';
import { useLive } from '../../context/LiveContext';

const HOLD_MS = 2000;

export default function SosButton() {
  const { t, actions, mySos } = useLive();
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(null);
  const frame = useRef(null);

  const stop = () => {
    startedAt.current = null;
    cancelAnimationFrame(frame.current);
    setProgress(0);
  };

  const tick = () => {
    if (!startedAt.current) return;
    const p = Math.min(1, (Date.now() - startedAt.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      stop();
      actions.sendSos();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  const start = (e) => {
    e.preventDefault();
    if (mySos) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startedAt.current = Date.now();
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <button
      id="focus-sos"
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-hidden h-touch px-4 rounded border-2 font-condensed font-bold uppercase flex items-center gap-2 select-none touch-none ${
        mySos ? 'bg-danger border-danger text-white animate-pulse' : 'border-danger text-danger'
      }`}
      aria-label={`${t('sos.button')} — ${t('sos.hold')}`}
      title={t('sos.hold')}
    >
      <span className="absolute inset-y-0 left-0 bg-danger/60" style={{ width: `${progress * 100}%` }} aria-hidden="true" />
      <Siren size={24} strokeWidth={2.5} className="relative" />
      <span className="relative text-xl">{t('sos.button')}</span>
      {!mySos && <span className="relative hidden xl:inline text-xs font-semibold opacity-80">{t('sos.hold')}</span>}
    </button>
  );
}
