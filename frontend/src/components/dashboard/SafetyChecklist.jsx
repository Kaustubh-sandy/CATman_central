import { Check, Volume2, Loader2, AlertOctagon, ShieldCheck } from 'lucide-react';
import { useLive } from '../../context/LiveContext';
import PrimaryButton from '../PrimaryButton';

const ITEMS = ['SEATBELT_FASTENED', 'WALKAROUND_DONE', 'MIRRORS_ADJUSTED', 'PPE_WORN', 'AREA_CLEAR', 'HORN_TESTED'];

function ItemRow({ id, item, onToggle, onHorn, hornWaiting }) {
  const { t } = useLive();
  const checked = !!item?.checked;
  const isHorn = id === 'HORN_TESTED';

  return (
    <li className={`rounded border-2 p-3 ${item?.rejected ? 'border-danger bg-danger/10' : checked ? 'border-ok bg-ok/10' : 'border-border bg-surface'}`}>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={isHorn}
          onClick={() => onToggle(id, !checked)}
          className={`shrink-0 h-touch w-touch rounded border-2 flex items-center justify-center ${
            checked ? 'bg-ok border-ok text-ink' : 'border-white/50'
          } ${isHorn ? 'cursor-default' : ''}`}
          aria-label={t(`checklist.item.${id}`)}
          aria-pressed={checked}
        >
          {checked && <Check size={40} strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-condensed font-bold text-2xl leading-tight">{t(`checklist.item.${id}`)}</div>
          {checked && item.verifiedBy === 'SENSOR' && <div className="text-ok font-semibold">{t('checklist.verifiedBySensor')}</div>}
          {checked && item.verifiedBy === 'HORN_EVENT' && <div className="text-ok font-semibold">{t('checklist.verifiedByMachine')}</div>}
          {item?.rejected && (
            <div className="text-danger font-semibold flex items-center gap-1">
              <AlertOctagon size={18} strokeWidth={2.5} />
              {t(`checklist.reject.${item.rejected.code}`)}
            </div>
          )}
        </div>
        {isHorn && !checked && (
          <button
            type="button"
            onClick={onHorn}
            disabled={hornWaiting}
            className="shrink-0 h-touch px-4 rounded bg-catYellow text-ink font-condensed font-bold text-lg uppercase flex items-center gap-2 disabled:opacity-60"
          >
            {hornWaiting ? <Loader2 size={22} className="animate-spin" /> : <Volume2 size={22} strokeWidth={2.5} />}
            {hornWaiting ? t('checklist.waitingHorn') : t('checklist.testHorn')}
          </button>
        )}
      </div>
    </li>
  );
}

export default function SafetyChecklist({ checklist }) {
  const { t, actions } = useLive();
  const items = checklist?.items || {};
  const done = ITEMS.filter((id) => items[id]?.checked).length;
  const hornWaiting = checklist?.hornTest?.status === 'WAITING';

  return (
    <div id="focus-checklist" className="space-y-3">
      <div className="font-condensed text-label uppercase tracking-wide text-white/60">
        {t('checklist.progress', { done, total: ITEMS.length })}
      </div>
      <ul className="space-y-3">
        {ITEMS.map((id) => (
          <ItemRow
            key={id}
            id={id}
            item={items[id]}
            onToggle={actions.checkItem}
            onHorn={actions.testHorn}
            hornWaiting={hornWaiting}
          />
        ))}
      </ul>
      <PrimaryButton icon={ShieldCheck} disabled={done < ITEMS.length} onClick={actions.completeChecklist}>
        {t('checklist.done')}
      </PrimaryButton>
    </div>
  );
}
