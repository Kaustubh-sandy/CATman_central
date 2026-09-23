import { AlertOctagon, Wrench, ArrowRightLeft, RotateCcw, Phone } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import PrimaryButton from '../PrimaryButton';
import SensorList from './SensorList';

export default function PrecheckFailed({ precheck }) {
  const { t, actions } = useLive();
  const failed = precheck?.failedSensors || [];
  const spare = (precheck?.spareMachines || [])[0];

  return (
    <div id="focus-precheck" className="space-y-4">
      <div className="rounded border-2 border-danger bg-danger/10 p-5">
        <div className="flex items-center gap-3 text-danger">
          <AlertOctagon size={44} strokeWidth={2.5} aria-hidden="true" />
          <div className="font-condensed font-bold text-3xl uppercase leading-tight">
            {precheck?.machineOffline ? t('precheck.offline') : t('precheck.failedTitle')}
          </div>
        </div>
        {precheck?.maintenanceTicketId && (
          <div className="mt-3 flex items-center gap-2 text-white/80">
            <Wrench size={20} strokeWidth={2.5} />
            {t('precheck.ticket', { id: precheck.maintenanceTicketId })}
          </div>
        )}
      </div>

      {failed.length > 0 && <SensorList sensors={precheck.sensors} only={failed.map((s) => s.sensor)} />}

      {spare ? (
        <PrimaryButton icon={ArrowRightLeft} onClick={() => actions.switchMachine(spare.machineId)}>
          {t('precheck.useSpare', { machineId: spare.machineId })}
        </PrimaryButton>
      ) : (
        <div className="rounded border-2 border-warn text-warn p-3 font-condensed font-bold text-lg flex items-center gap-2">
          <Phone size={22} strokeWidth={2.5} />
          {t('precheck.noSpare')}
        </div>
      )}
      <PrimaryButton icon={RotateCcw} tone="secondary" onClick={actions.runPrecheck}>
        {t('precheck.retry')}
      </PrimaryButton>
    </div>
  );
}
