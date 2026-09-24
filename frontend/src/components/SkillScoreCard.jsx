import { useLive } from '../context/LiveContext';

const SKILL_COLORS = {
  IDLE_MANAGEMENT: { bar: 'bg-cyan-400', border: 'border-cyan-400', text: 'text-cyan-400' },
  FUEL_EFFICIENCY: { bar: 'bg-emerald-400', border: 'border-emerald-400', text: 'text-emerald-400' },
  SMOOTH_OPERATION: { bar: 'bg-violet-400', border: 'border-violet-400', text: 'text-violet-400' },
  SAFETY_AWARENESS: { bar: 'bg-amber-400', border: 'border-amber-400', text: 'text-amber-400' },
  TASK_EXECUTION: { bar: 'bg-rose-400', border: 'border-rose-400', text: 'text-rose-400' },
};

const LABEL_STYLE = {
  GOOD: 'text-ok',
  DEVELOPING: 'text-catYellow',
  NEEDS_ATTENTION: 'text-warn',
  CRITICAL: 'text-danger',
};

const TREND_ICON = { UP: '▲', DOWN: '▼', STABLE: '●' };
const TREND_STYLE = { UP: 'text-ok', DOWN: 'text-danger', STABLE: 'text-white/40' };

export default function SkillScoreCard({ skillId, skill, compact = false }) {
  const { t } = useLive();
  const colors = SKILL_COLORS[skillId] || SKILL_COLORS.IDLE_MANAGEMENT;

  if (!skill) return null;

  const barWidth = `${Math.max(2, skill.score)}%`;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className={`font-condensed font-bold text-sm uppercase ${colors.text}`}>
          {t(`skills.area.${skillId}`)}
        </span>
        <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
          <div className={`h-full ${colors.bar} transition-all duration-500`} style={{ width: barWidth }} />
        </div>
        <span className="font-condensed font-bold font-tabular w-8 text-right">{skill.score}</span>
      </div>
    );
  }

  return (
    <div className={`rounded border-2 ${colors.border} bg-surface p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-condensed font-bold text-lg uppercase leading-tight">
          {t(`skills.area.${skillId}`)}
        </div>
        <div className={`flex items-center gap-1 font-condensed font-bold text-sm ${TREND_STYLE[skill.trend]}`}>
          <span>{TREND_ICON[skill.trend]}</span>
          <span>{t(`skills.trend.${skill.trend}`)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div className={`font-condensed font-bold text-5xl font-tabular leading-none ${colors.text}`}>
          {skill.score}
        </div>
        <div className={`font-condensed font-bold uppercase text-sm mb-1 ${LABEL_STYLE[skill.label]}`}>
          {t(`skills.label.${skill.label}`)}
        </div>
      </div>

      <div className="mt-3 h-3 rounded bg-white/10 overflow-hidden">
        <div
          className={`h-full ${colors.bar} transition-all duration-700 ease-out`}
          style={{ width: barWidth }}
        />
      </div>

      {skill.penalties?.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {skill.penalties.slice(0, 2).map((p) => (
            <div key={p.metric} className="text-xs text-white/50">
              {p.metric}: {p.observed} (baseline {p.baseline}) −{p.penalty}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
