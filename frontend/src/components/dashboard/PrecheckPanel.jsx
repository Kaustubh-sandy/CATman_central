import { X, Cpu, UserCheck, Radio } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import SensorList from './SensorList';

export default function PrecheckPanel({ precheck }) {
  const { t, actions } = useLive();
  const sensors = precheck?.sensors || [];
  const total = precheck?.total || 15;
  const manual = precheck?.mode === 'MANUAL';
  const waitingAck = !precheck?.mode;
  const done = sensors.length;
  const okCount = sensors.filter((s) => s.status === 'OK').length;
  const pct = Math.round((done / total) * 100);

  let line;
  if (waitingAck) line = t('precheck.waitingAck');
  else if (manual) line = t('precheck.waitingManual', { done, total });
  else line = t('precheck.checking', { done: okCount, total });

  const ModeIcon = waitingAck ? Radio : manual ? UserCheck : Cpu;

  return (
    <div id="focus-precheck" className="rounded border-2 border-catYellow bg-surface p-5 space-y-4">
      <div className="h-3 -mx-5 -mt-5 mb-2 bg-[repeating-linear-gradient(135deg,#FFCD11_0_14px,#121212_14px_28px)]" aria-hidden="true" />
      <div className="flex items-center gap-3">
        <ModeIcon size={32} strokeWidth={2.5} className="text-catYellow shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <div className="font-condensed font-bold text-2xl leading-tight">{line}</div>
          {!waitingAck && <div className="text-white/60">{t(`precheck.mode.${precheck.mode}`)}</div>}
        </div>
      </div>

      <div className="h-4 w-full rounded border-2 border-border bg-black/40 overflow-hidden">
        <div className="h-full bg-catYellow transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      <SensorList sensors={sensors} running />

      <button
        type="button"
        onClick={actions.cancelPrecheck}
        className="w-full h-touch rounded border-2 border-white/40 font-condensed font-bold text-xl uppercase flex items-center justify-center gap-2"
      >
        <X size={24} strokeWidth={2.5} />
        {t('precheck.cancel')}
      </button>
    </div>
  );
}
