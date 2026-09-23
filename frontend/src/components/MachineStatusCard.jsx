import { Fuel, Thermometer, Droplets, Clock } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { useLive } from '../context/LiveContext';
import StatusPill from './StatusPill';
import GaugeBar from './GaugeBar';
import { formatRelativeTime, toneForFuel, toneForEngineTemp, toneForHydraulicTemp } from '../utils/format';

export default function MachineStatusCard({ machine, compact = false }) {
  useNow(1000);
  const { t } = useLive();
  const telemetry = machine?.telemetry;
  const status = machine?.connectivity?.status || 'OFFLINE';

  return (
    <div className="rounded border-2 border-border bg-surface p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-condensed text-label uppercase tracking-wide text-white/60">{machine?.type || t('top.machine')}</div>
          <div className="font-condensed font-bold text-3xl leading-none">{machine?.machineId}</div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mb-4">
        <span className="inline-block rounded border-2 border-white/30 px-3 py-1 font-condensed font-bold text-xl uppercase tracking-wide">
          {telemetry?.state ? t(`machineState.${telemetry.state}`) : t('card.noData')}
        </span>
      </div>

      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : 'space-y-4'}>
        <GaugeBar label={t('card.fuel')} Icon={Fuel} value={machine?.fuelPercent} unit="%" max={100} tone={toneForFuel(machine?.fuelPercent)} />
        <GaugeBar
          label={t('card.engineTemp')}
          Icon={Thermometer}
          value={telemetry?.engineTemperature}
          unit="°C"
          max={120}
          tone={toneForEngineTemp(telemetry?.engineTemperature)}
        />
        <GaugeBar
          label={t('card.hydraulicTemp')}
          Icon={Droplets}
          value={telemetry?.hydraulicTemperature}
          unit="°C"
          max={110}
          tone={toneForHydraulicTemp(telemetry?.hydraulicTemperature)}
        />
      </div>

      <div className="mt-4 pt-4 border-t-2 border-border flex items-center gap-1.5 text-white/60 font-tabular text-sm">
        <Clock size={16} strokeWidth={2.5} aria-hidden="true" />
        {t('card.lastSeen', { ago: formatRelativeTime(machine?.connectivity?.lastSeenAt, t) })}
      </div>
    </div>
  );
}
