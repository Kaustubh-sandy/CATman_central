import { Siren, UserCheck } from 'lucide-react';
import { useLive } from '../../context/LiveContext';

export default function SosStatus() {
  const { t, mySos, actions } = useLive();
  if (!mySos) return null;
  const acknowledged = mySos.status === 'ACKNOWLEDGED';

  return (
    <div role="status" className={`px-4 py-3 flex items-center gap-4 border-b-2 border-black ${acknowledged ? 'bg-warn text-ink' : 'bg-danger text-white'}`}>
      {acknowledged ? <UserCheck size={36} strokeWidth={2.5} /> : <Siren size={36} strokeWidth={2.5} className="animate-pulse" />}
      <div className="flex-1 font-condensed font-bold text-2xl uppercase">{acknowledged ? t('sos.acknowledged') : t('sos.sent')}</div>
      <button
        type="button"
        onClick={() => actions.updateIncident(mySos.id, 'cancel')}
        className="h-touch px-4 rounded bg-white text-ink font-condensed font-bold text-lg uppercase border-2 border-black"
      >
        {t('sos.cancel')}
      </button>
    </div>
  );
}
