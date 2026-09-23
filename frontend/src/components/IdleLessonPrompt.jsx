import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useLive } from '../context/LiveContext';

// Shown only while the machine is parked (IDLE + brake + lockout); the backend
// withdraws it the moment the machine moves.
export default function IdleLessonPrompt() {
  const { t, idlePrompt, machine, actions } = useLive();
  const navigate = useNavigate();
  if (!idlePrompt || machine?.telemetry?.state !== 'IDLE') return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-[420px] z-20 rounded border-2 border-catYellow bg-ink p-4 space-y-3">
      <div className="flex items-center gap-3">
        <GraduationCap size={36} strokeWidth={2.5} className="text-catYellow shrink-0" />
        <div>
          <div className="font-condensed font-bold text-2xl leading-tight">{t('idle.title')}</div>
          <div className="text-white/70">
            {t('idle.body', { n: idlePrompt.idleMinutes })} {idlePrompt.title}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={actions.dismissIdlePrompt} className="h-touch rounded border-2 border-white/40 font-condensed font-bold text-lg uppercase">
          {t('idle.later')}
        </button>
        <button
          type="button"
          onClick={() => {
            actions.dismissIdlePrompt();
            navigate(`/learning/sim/${idlePrompt.moduleId}`);
          }}
          className="h-touch rounded bg-catYellow text-ink font-condensed font-bold text-lg uppercase"
        >
          {t('idle.start')}
        </button>
      </div>
    </div>
  );
}
