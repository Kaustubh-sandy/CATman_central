import { Fuel, Thermometer, Droplets, Clock } from 'lucide-react';
import StatusPill from './StatusPill';
import GaugeBar from './GaugeBar';
import { formatRelativeTime, toneForFuel, toneForEngineTemp, toneForHydraulicTemp } from '../utils/format';

export default function MachineStatusCard({ machine }) {
  const telemetry = machine?.telemetry;
  const status = machine?.connectivity?.status || 'OFFLINE';
  const lastSeenAt = machine?.connectivity?.lastSeenAt;

  return (
    <div className="rounded border-2 border-border bg-surface p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-condensed text-label uppercase tracking-wide text-white/60">
            {machine?.type || 'Machine'}
          </div>
          <div className="font-condensed font-bold text-3xl leading-none">{machine?.machineId}</div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mb-4">
        <span className="inline-block rounded border-2 border-white/30 px-3 py-1 font-condensed font-bold text-xl uppercase tracking-wide">
          {telemetry?.state || 'NO DATA'}
        </span>
      </div>

      <div className="space-y-4">
        <GaugeBar
          label="Fuel"
          Icon={Fuel}
          value={machine?.fuelPercent}
          unit="%"
          max={100}
          tone={toneForFuel(machine?.fuelPercent)}
        />
        <GaugeBar
          label="Engine Temp"
          Icon={Thermometer}
          value={telemetry?.engineTemperature}
          unit="°C"
          max={120}
          tone={toneForEngineTemp(telemetry?.engineTemperature)}
        />
        <GaugeBar
          label="Hydraulic Temp"
          Icon={Droplets}
          value={telemetry?.hydraulicTemperature}
          unit="°C"
          max={110}
          tone={toneForHydraulicTemp(telemetry?.hydraulicTemperature)}
        />
      </div>

      <div className="mt-4 pt-4 border-t-2 border-border flex items-center gap-1.5 text-white/60 font-tabular text-sm">
        <Clock size={16} strokeWidth={2.5} aria-hidden="true" />
        Last seen {formatRelativeTime(lastSeenAt)}
      </div>
    </div>
  );
}
