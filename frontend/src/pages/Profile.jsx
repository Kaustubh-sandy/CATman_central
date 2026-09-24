import { useEffect, useState } from 'react';
import { Award, Medal, CheckCircle2, Circle } from 'lucide-react';
import { apiClient } from '../api/client';
import { useLive } from '../context/LiveContext';
import SkillScoreCard from '../components/SkillScoreCard';

function SafetyTrend({ points }) {
  const { t } = useLive();
  if (!points.length) return <div className="text-white/60">{t('profile.noShifts')}</div>;
  return (
    <div className="flex items-end gap-2 h-40 border-b-2 border-border">
      {points.map((p) => {
        const tone = p.safetyScore >= 90 ? 'bg-ok' : p.safetyScore >= 70 ? 'bg-warn' : 'bg-danger';
        return (
          <div key={p.shiftId} className="flex-1 flex flex-col items-center justify-end h-full" title={new Date(p.endedAt).toLocaleString()}>
            <div className="font-condensed font-bold font-tabular">{p.safetyScore}</div>
            <div className={`w-full ${tone}`} style={{ height: `${Math.max(4, p.safetyScore)}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export default function Profile() {
  const { t, skillsVersion } = useLive();
  const [profile, setProfile] = useState(null);
  const [skills, setSkills] = useState(null);

  useEffect(() => {
    apiClient.get('/operators/me/profile').then((res) => setProfile(res.data));
    apiClient.get('/behavior/skills').then((res) => {
      if (res.data.skills) setSkills(res.data.skills);
    }).catch(() => {});
  }, [skillsVersion]);

  if (!profile) return <div className="max-w-4xl mx-auto text-white/60 font-condensed text-2xl uppercase">{t('dash.loading')}</div>;
  const op = profile.operator;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="font-condensed font-bold text-figure uppercase leading-none">{t('profile.title')}</div>

      <div className="rounded border-2 border-border bg-surface p-5 flex flex-wrap items-center gap-6">
        <div className="flex-1 min-w-[200px]">
          <div className="font-condensed font-bold text-3xl">{op.name}</div>
          <div className="text-white/60">
            {op.operatorId} · {t('profile.experience', { n: op.experienceYears })}
          </div>
          <div className="text-white/60 text-sm">{op.certifications?.join(' · ')}</div>
        </div>
        <div className="text-right">
          <div className="font-condensed font-bold text-figure text-catYellow leading-none flex items-center gap-2 justify-end">
            <Award size={40} strokeWidth={2.5} /> {t('top.level', { n: op.level })}
          </div>
          <div className="font-condensed text-xl font-tabular">{op.xp} XP</div>
          <div className="mt-1 h-3 w-48 rounded border-2 border-border bg-black/40 overflow-hidden ml-auto">
            <div className="h-full bg-catYellow" style={{ width: `${(op.xpIntoLevel / op.xpPerLevel) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Skill overview (compact) */}
      {skills && (
        <section>
          <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('skills.title')}</div>
          <div className="rounded border-2 border-border bg-surface p-4 space-y-2">
            {['IDLE_MANAGEMENT', 'FUEL_EFFICIENCY', 'SMOOTH_OPERATION', 'SAFETY_AWARENESS', 'TASK_EXECUTION'].map((id) => (
              <SkillScoreCard key={id} skillId={id} skill={skills[id]} compact />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('profile.badges')}</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {profile.badges.map((b) => (
            <div key={b.id} className={`rounded border-2 p-3 text-center ${b.earned ? 'border-catYellow text-catYellow' : 'border-border text-white/30'}`}>
              <Medal size={36} strokeWidth={2.5} className="mx-auto" />
              <div className="font-condensed font-bold uppercase mt-1">{t(`badge.${b.id}`)}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('profile.safetyTrend')}</div>
        <div className="rounded border-2 border-border bg-surface p-4">
          <SafetyTrend points={profile.safetyTrend} />
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded border-2 border-border bg-surface p-4">
          <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('profile.training')}</div>
          <ul className="space-y-2">
            {profile.training.map((m) => (
              <li key={m.moduleId} className="flex items-center gap-2">
                {m.passed ? <CheckCircle2 className="text-ok" size={22} /> : <Circle className="text-white/30" size={22} />}
                <span className="flex-1">{m.title}</span>
                {m.bestScore !== null && (
                  <span className="font-tabular text-white/60">
                    {m.bestScore}/{m.maxScore}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border-2 border-border bg-surface p-4">
          <div className="font-condensed text-label uppercase text-white/60 mb-2">{t('profile.alertsWeek')}</div>
          <div className="font-condensed font-bold text-figure font-tabular">{profile.alertsThisWeek.total}</div>
          <ul className="mt-2 space-y-1">
            {Object.entries(profile.alertsThisWeek.byRule).map(([rule, n]) => (
              <li key={rule} className="flex justify-between">
                <span>{t(`alert.title.${rule}`)}</span>
                <span className="font-tabular">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
