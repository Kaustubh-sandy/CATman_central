import { AlertTriangle, Check } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import PrimaryButton from '../PrimaryButton';
import SensorList from './SensorList';

export default function PrecheckWarnings({ precheck }) {
  const { t, actions } = useLive();
  const warnings = (precheck?.sensors || []).filter((s) => s.status !== 'OK');

  return (
    <div id="focus-precheck" className="space-y-4">
      <div className="rounded border-2 border-warn bg-warn/10 p-5 flex items-center gap-3 text-warn">
        <AlertTriangle size={40} strokeWidth={2.5} aria-hidden="true" />
        <div className="font-condensed font-bold text-2xl uppercase leading-tight">{t('precheck.warningsTitle')}</div>
      </div>
      <SensorList sensors={precheck.sensors} only={warnings.map((s) => s.sensor)} />
      <PrimaryButton icon={Check} onClick={actions.acknowledgeWarnings}>
        {t('precheck.ackWarnings')}
      </PrimaryButton>
    </div>
  );
}
