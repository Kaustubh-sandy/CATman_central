import { useState } from 'react';
import { LogOut, ArrowLeft } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import PrimaryButton from '../PrimaryButton';

export default function EndShiftForm({ onCancel }) {
  const { t, actions } = useLive();
  const [note, setNote] = useState('');

  return (
    <div className="rounded border-2 border-border bg-surface p-5 space-y-4">
      <label className="block">
        <span className="font-condensed text-label uppercase tracking-wide text-white/60">{t('summary.handover')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t('summary.handoverPlaceholder')}
          className="mt-2 w-full rounded border-2 border-border bg-black/40 p-3 text-lg text-white placeholder-white/40"
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <PrimaryButton icon={ArrowLeft} tone="secondary" onClick={onCancel}>
          {t('summary.cancel')}
        </PrimaryButton>
        <PrimaryButton icon={LogOut} onClick={() => actions.endShift(note)}>
          {t('summary.endNow')}
        </PrimaryButton>
      </div>
    </div>
  );
}
