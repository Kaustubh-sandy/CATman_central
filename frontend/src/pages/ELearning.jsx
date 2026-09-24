import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Clock, Award, CloudRain, Sun, EyeOff, Play, CheckCircle2, Sparkles } from 'lucide-react';
import { apiClient } from '../api/client';
import { useLive } from '../context/LiveContext';

const DIFFICULTY_CLASSES = {
  EASY: 'border-ok text-ok',
  MEDIUM: 'border-warn text-warn',
  HARD: 'border-danger text-danger',
};

function ModuleCard({ module, progress, reason, skillArea, urgency, onStart }) {
  const { t } = useLive();
  const env = module.environment;
  const rain = env.weather === 'RAIN';

  return (
    <div className={`flex flex-col rounded border-2 bg-surface p-4 ${reason ? 'border-catYellow' : 'border-border'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded border-2 border-catYellow px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide text-catYellow">
            <Box size={16} strokeWidth={2.5} aria-hidden="true" />
            3D
          </span>
          {skillArea && (
            <span className="rounded bg-white/10 px-2 py-0.5 font-condensed text-xs uppercase font-bold tracking-wide text-white/80">
              {t(`skills.area.${skillArea}`)}
            </span>
          )}
          {urgency === 'HIGH' && (
            <span className="rounded bg-danger/20 border border-danger px-2 py-0.5 font-condensed text-xs uppercase font-bold tracking-wide text-danger">
              High Priority
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {progress?.passed && (
            <span className="inline-flex items-center gap-1 rounded border-2 border-ok px-2 py-0.5 font-condensed text-sm font-bold uppercase text-ok">
              <CheckCircle2 size={16} strokeWidth={2.5} />
              {t('learning.passed')}
            </span>
          )}
          <span className={`rounded border-2 px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide ${DIFFICULTY_CLASSES[module.difficulty] || DIFFICULTY_CLASSES.EASY}`}>
            {module.difficulty}
          </span>
        </div>
      </div>

      <div className="mt-3 font-condensed text-2xl font-bold uppercase leading-tight">{module.title}</div>
      <p className="mt-1 text-white/70">{module.summary}</p>
      {reason && (
        <div className="mt-2 flex items-center gap-2 text-catYellow font-condensed font-bold text-lg">
          <Sparkles size={18} strokeWidth={2.5} />
          {reason}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
        <span className="flex items-center gap-1">
          {rain ? <CloudRain size={16} strokeWidth={2.5} /> : <Sun size={16} strokeWidth={2.5} />}
          {t(`weather.${env.weather}`)}
        </span>
        {env.visibility === 'LOW' && (
          <span className="flex items-center gap-1 text-warn">
            <EyeOff size={16} strokeWidth={2.5} />
            {t('visibility.LOW')}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock size={16} strokeWidth={2.5} />
          {module.durationMin} min
        </span>
        <span className="flex items-center gap-1 text-catYellow">
          <Award size={16} strokeWidth={2.5} />
          {module.xp} XP
        </span>
        {progress?.attempts > 0 && (
          <span>
            {t('learning.attempts', { n: progress.attempts })} · {t('learning.best', { score: progress.bestScore, max: progress.maxScore })}
          </span>
        )}
      </div>

      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onStart(module.id)}
        className="mt-4 h-touch w-full rounded bg-catYellow font-condensed text-xl font-bold uppercase tracking-wide text-ink flex items-center justify-center gap-2 hover:bg-[#e6ba0f]"
      >
        <Play size={24} strokeWidth={2.5} aria-hidden="true" />
        {t('learning.start')}
      </button>
    </div>
  );
}

export default function ELearning() {
  const navigate = useNavigate();
  const { t } = useLive();
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([apiClient.get('/training/modules'), apiClient.get('/training/progress'), apiClient.get('/training/recommended')])
      .then(([m, p, r]) => {
        setModules(m.data.modules);
        setProgress(p.data);
        setRecommended(r.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const reasonText = (r) => {
    if (!r || !r.reasonCode) return null;
    if (r.reasonCode === 'SKILL_SCORE_LOW') {
      return t('learning.reason.SKILL_SCORE_LOW', {
        skill: t(`skills.area.${r.skillArea}`),
        score: r.params?.score,
        threshold: r.params?.threshold,
      });
    }
    if (r.reasonCode === 'SKILL_DECLINING') {
      return t('learning.reason.SKILL_DECLINING', {
        skill: t(`skills.area.${r.skillArea}`),
        shifts: r.params?.shifts,
      });
    }
    if (r.reasonCode === 'SAFETY_REPEAT') {
      return t('learning.reason.SAFETY_REPEAT', {
        rule: t(`alert.title.${r.params?.ruleId}`),
        count: r.params?.count,
        outOf: r.params?.outOf,
      });
    }
    if (r.reasonCode === 'ALERTS_THIS_WEEK') {
      return t('learning.reason.ALERTS_THIS_WEEK', {
        count: r.params?.count,
        rule: t(`alert.title.${r.params?.rule}`),
      });
    }
    if (r.reasonCode === 'NOT_COMPLETED') {
      return t('learning.reason.NOT_COMPLETED');
    }
    return t(`learning.reason.${r.reasonCode}`);
  };

  const start = (id) => navigate(`/learning/sim/${id}`);
  const topPicks = recommended.slice(0, 2);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="font-condensed font-bold text-figure uppercase leading-none">{t('learning.title')}</div>
        <div className="text-white/60 mt-1">{t('learning.subtitle')}</div>
      </div>

      {error && <div className="rounded border-2 border-danger bg-danger/10 p-4 text-danger font-condensed font-semibold">{error}</div>}

      {topPicks.length > 0 && (
        <section>
          <div className="font-condensed text-label uppercase tracking-wide text-catYellow mb-2">{t('learning.recommended')}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topPicks.map((r) => (
              <ModuleCard
                key={r.moduleId}
                module={r.module}
                progress={progress.find((p) => p.moduleId === r.moduleId)}
                reason={reasonText(r)}
                skillArea={r.skillArea}
                urgency={r.urgency}
                onStart={start}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="font-condensed text-label uppercase tracking-wide text-white/60 mb-2">{t('learning.all')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((m) => (
            <ModuleCard key={m.id} module={m} progress={progress.find((p) => p.moduleId === m.id)} onStart={start} />
          ))}
        </div>
      </section>
    </div>
  );
}
