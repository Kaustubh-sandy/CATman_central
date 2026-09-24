import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, TrendingUp, TrendingDown, Minus, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { apiClient } from '../api/client';
import { useLive } from '../context/LiveContext';
import SkillScoreCard from '../components/SkillScoreCard';

const SKILL_ORDER = ['IDLE_MANAGEMENT', 'FUEL_EFFICIENCY', 'SMOOTH_OPERATION', 'SAFETY_AWARENESS', 'TASK_EXECUTION'];

const LOOP_STATUS_ICON = {
  EVALUATED: CheckCircle2,
  PENDING: Clock,
};

export default function SkillProfile() {
  const { t } = useLive();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [recs, setRecs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiClient.get('/behavior/skills'),
      apiClient.get('/behavior/recommendations'),
    ])
      .then(([s, r]) => {
        setData(s.data);
        setRecs(r.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="rounded border-2 border-danger bg-danger/10 p-4 text-danger font-condensed font-semibold">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-white/40" size={48} />
      </div>
    );
  }

  const { skills, baseline, observationCount, minShiftsRequired, postTrainingWindows } = data;

  // Not enough shifts yet.
  if (!skills) {
    const remaining = Math.max(0, minShiftsRequired - observationCount);
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <div className="font-condensed font-bold text-figure uppercase leading-none">{t('skills.title')}</div>
          <div className="text-white/60 mt-1">{t('skills.subtitle')}</div>
        </div>
        <div className="rounded border-2 border-border bg-surface p-8 text-center">
          <div className="font-condensed font-bold text-3xl text-white/60">
            {t('skills.notReady', { remaining })}
          </div>
          <div className="mt-2 text-white/40">
            {t('skills.observations', { n: observationCount })}
          </div>
        </div>
      </div>
    );
  }

  // Overall score = average of all skills.
  const allScores = SKILL_ORDER.map((id) => skills[id]?.score).filter((s) => typeof s === 'number');
  const overallScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-condensed font-bold text-figure uppercase leading-none">{t('skills.title')}</div>
          <div className="text-white/60 mt-1">{t('skills.subtitle')}</div>
        </div>
        <div className="text-right">
          <div className="font-condensed font-bold text-5xl font-tabular text-catYellow leading-none">
            {overallScore}
          </div>
          <div className="text-white/40 text-sm">
            {baseline && t('skills.baseline', { n: baseline.shiftCount })}
          </div>
        </div>
      </div>

      {/* Skill cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SKILL_ORDER.map((id) => (
          <SkillScoreCard key={id} skillId={id} skill={skills[id]} />
        ))}
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <section>
          <div className="font-condensed text-label uppercase tracking-wide text-catYellow mb-2">
            {t('skills.recommendedTraining')}
          </div>
          <div className="space-y-2">
            {recs.slice(0, 3).map((r) => (
              <div
                key={`${r.moduleId}-${r.skillArea}`}
                className="rounded border-2 border-catYellow bg-surface p-4 flex items-center gap-4 cursor-pointer hover:bg-catYellow/10 transition-colors"
                onClick={() => navigate(`/learning/sim/${r.moduleId}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/learning/sim/${r.moduleId}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-condensed font-bold text-xl">{r.module?.title || r.moduleId}</div>
                  <div className="text-white/70 text-sm">
                    {r.reasonCode === 'SKILL_SCORE_LOW' &&
                      t('learning.reason.SKILL_SCORE_LOW', {
                        skill: t(`skills.area.${r.skillArea}`),
                        score: r.params.score,
                        threshold: r.params.threshold,
                      })}
                    {r.reasonCode === 'SKILL_DECLINING' &&
                      t('learning.reason.SKILL_DECLINING', {
                        skill: t(`skills.area.${r.skillArea}`),
                        shifts: r.params.shifts,
                      })}
                    {r.reasonCode === 'SAFETY_REPEAT' &&
                      t('learning.reason.SAFETY_REPEAT', {
                        rule: t(`alert.title.${r.params.ruleId}`),
                        count: r.params.count,
                        outOf: r.params.outOf,
                      })}
                    {r.reasonCode === 'ALERTS_THIS_WEEK' &&
                      t('learning.reason.ALERTS_THIS_WEEK', {
                        count: r.params.count,
                        rule: t(`alert.title.${r.params.rule}`),
                      })}
                    {r.reasonCode === 'NOT_COMPLETED' && t('learning.reason.NOT_COMPLETED')}
                  </div>
                </div>
                {r.urgency === 'HIGH' && (
                  <span className="rounded px-2 py-0.5 bg-danger text-white font-condensed font-bold text-sm uppercase">
                    High
                  </span>
                )}
                <ArrowRight size={24} className="text-catYellow shrink-0" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Training impact / closed loops */}
      {postTrainingWindows.length > 0 && (
        <section>
          <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-2">
            {t('skills.trainingLoops')}
          </div>
          <div className="space-y-2">
            {postTrainingWindows.map((w, i) => {
              const Icon = LOOP_STATUS_ICON[w.status] || Clock;
              return (
                <div key={i} className="rounded border-2 border-border bg-surface p-4 flex items-center gap-4">
                  <Icon
                    size={28}
                    strokeWidth={2.5}
                    className={w.improved ? 'text-ok' : w.status === 'PENDING' ? 'text-catYellow' : 'text-white/40'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-condensed font-bold text-lg">
                      {t(`skills.area.${w.skillArea}`)}
                    </div>
                    <div className="text-white/60 text-sm">
                      {w.status === 'PENDING' && t('skills.loopPending')}
                      {w.status === 'EVALUATED' && w.improved && t('skills.loopImproved', { delta: w.delta })}
                      {w.status === 'EVALUATED' && !w.improved && t('skills.loopNoChange')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 font-condensed font-tabular text-sm">
                    {w.preSnapshot && (
                      <div className="text-center">
                        <div className="text-white/40">{t('skills.preScore')}</div>
                        <div className="font-bold text-xl">{w.preSnapshot.score}</div>
                      </div>
                    )}
                    {w.postSnapshot && (
                      <>
                        <ArrowRight size={18} className="text-white/30" />
                        <div className="text-center">
                          <div className="text-white/40">{t('skills.postScore')}</div>
                          <div className={`font-bold text-xl ${w.improved ? 'text-ok' : ''}`}>
                            {w.postSnapshot.score}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
