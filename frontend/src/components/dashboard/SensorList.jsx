import { CheckCircle2, AlertTriangle, AlertOctagon, Loader2, HelpCircle, UserCheck } from 'lucide-react';
import { useLive } from '../../context/LiveContext';

// Must match backend precheck.service.js / simulator sensors.js.
export const SENSORS = [
  'ENGINE_ECU', 'FUEL_SENSOR', 'HYDRAULIC_TEMP', 'ENGINE_TEMP', 'OIL_PRESSURE',
  'VIBRATION', 'SEATBELT_SENSOR', 'SEAT_PRESENCE', 'GPS', 'PROXIMITY_FRONT',
  'PROXIMITY_REAR', 'TILT_SENSOR', 'BRAKES', 'LIGHTS_HORN', 'CAMERA',
];
export const CRITICAL_SENSORS = new Set(['ENGINE_ECU', 'BRAKES', 'SEATBELT_SENSOR', 'PROXIMITY_FRONT', 'PROXIMITY_REAR', 'TILT_SENSOR']);

const STATUS_STYLE = {
  OK: { cls: 'text-ok border-ok', Icon: CheckCircle2 },
  WARN: { cls: 'text-warn border-warn', Icon: AlertTriangle },
  FAIL: { cls: 'text-danger border-danger', Icon: AlertOctagon },
  NO_RESPONSE: { cls: 'text-danger border-danger', Icon: HelpCircle },
};

function SensorRow({ id, result, pending }) {
  const { t } = useLive();
  const style = result ? STATUS_STYLE[result.status] || STATUS_STYLE.NO_RESPONSE : null;
  const manual = result?.verifiedBy === 'MACHINE_SIDE_MANUAL';

  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 ${result && result.status !== 'OK' ? 'bg-white/5' : ''}`}>
      <div className="w-8 shrink-0 flex justify-center">
        {style ? (
          <style.Icon className={style.cls.split(' ')[0]} size={26} strokeWidth={2.5} aria-hidden="true" />
        ) : pending ? (
          <Loader2 className="text-white/40 animate-spin" size={24} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <span className="h-3 w-3 rounded-full bg-white/20" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-condensed font-bold text-lg leading-tight">
          {t(`sensor.${id}`)}
          {CRITICAL_SENSORS.has(id) && <span className="ml-2 text-xs text-danger uppercase">{t('precheck.critical')}</span>}
        </div>
        {result && (
          <div className="text-sm text-white/60 truncate">
            {result.value !== undefined && result.value !== null && `${result.value}${result.unit ? ` ${result.unit}` : ''} · `}
            {result.note || result.message}
          </div>
        )}
        {manual && (
          <div className="text-xs text-white/60 flex items-center gap-1 mt-0.5">
            <UserCheck size={14} strokeWidth={2.5} />
            {t('precheck.verifiedManual')}
            {result.override && <span className="text-warn font-bold ml-1">· {t('precheck.override')}</span>}
          </div>
        )}
      </div>
      {result && (
        <span className={`shrink-0 rounded border-2 px-2 py-0.5 font-condensed font-bold uppercase ${style.cls}`}>
          {t(`sensorStatus.${result.status}`)}
        </span>
      )}
    </li>
  );
}

export default function SensorList({ sensors = [], running = false, only = null }) {
  const byId = new Map(sensors.map((s) => [s.sensor, s]));
  const ids = only || SENSORS;
  return (
    <ul className="divide-y-2 divide-border rounded border-2 border-border bg-black/20">
      {ids.map((id) => (
        <SensorRow key={id} id={id} result={byId.get(id)} pending={running} />
      ))}
    </ul>
  );
}
