import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Clock, Award, CloudRain, Sun, EyeOff, Play } from 'lucide-react';
import { apiClient } from '../api/client';

const DIFFICULTY_CLASSES = {
  EASY: 'border-ok text-ok',
  MEDIUM: 'border-warn text-warn',
  HARD: 'border-danger text-danger',
};

function formatSkill(skill) {
  return skill.replaceAll('_', ' ');
}

function ModuleCard({ module, onStart }) {
  const env = module.environment;
  const rain = env.weather === 'RAIN';

  return (
    <div className="flex flex-col rounded border-2 border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded border-2 border-catYellow px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide text-catYellow">
          <Box size={16} strokeWidth={2.5} aria-hidden="true" />
          3D Simulation
        </span>
        <span
          className={`rounded border-2 px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wide ${
            DIFFICULTY_CLASSES[module.difficulty] || DIFFICULTY_CLASSES.EASY
          }`}
        >
          {module.difficulty}
        </span>
      </div>

      <div className="mt-3 font-condensed text-2xl font-bold uppercase leading-tight">{module.title}</div>
      <p className="mt-1 text-white/70">{module.summary}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
        <span className="flex items-center gap-1">
          {rain ? <CloudRain size={16} strokeWidth={2.5} /> : <Sun size={16} strokeWidth={2.5} />}
          {rain ? 'Rain' : 'Clear'}
        </span>
        {env.visibility === 'LOW' && (
          <span className="flex items-center gap-1 text-warn">
            <EyeOff size={16} strokeWidth={2.5} />
            Low visibility
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
      </div>
      <div className="mt-1 font-condensed text-sm uppercase tracking-wide text-white/50">{formatSkill(module.skill)}</div>

      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onStart(module.id)}
        className="mt-4 h-touch w-full rounded bg-catYellow font-condensed text-xl font-bold uppercase tracking-wide text-ink flex items-center justify-center gap-2 hover:bg-[#e6ba0f]"
      >
        <Play size={24} strokeWidth={2.5} aria-hidden="true" />
        Start
      </button>
    </div>
  );
}

export default function ELearning() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/training/modules')
      .then((res) => {
        if (!cancelled) setModules(res.data.modules);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="font-condensed font-bold text-figure uppercase leading-none">E-Learning</div>
        <div className="text-white/60 mt-1">Practise in a 3D cab. Mistakes here cost nothing.</div>
      </div>

      {loading && <div className="text-white/60">Loading modules…</div>}
      {error && (
        <div className="rounded border-2 border-danger bg-danger/10 p-4 text-danger font-condensed font-semibold">
          Can't load modules: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((m) => (
          <ModuleCard key={m.id} module={m} onStart={(id) => navigate(`/learning/sim/${id}`)} />
        ))}
      </div>
    </div>
  );
}
