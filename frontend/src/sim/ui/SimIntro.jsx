import { Play, CloudRain, Sun, EyeOff, Clock, Award, ArrowLeft } from 'lucide-react';
import PrimaryButton from '../../components/PrimaryButton';

const CONTROLS = [
  ['Look around', 'Drag the view'],
  ['Use a control', 'Tap it in the cab'],
  ['Left stick', 'W A S D — arm / swing'],
  ['Right stick', '↑ ↓ ← → or I J K L — boom / bucket'],
  ['Horn', 'H  (button on right stick)'],
  ['Shortcuts', 'B belt · E key · Q lockout · T throttle · M monitor'],
];

export default function SimIntro({ module, onStart, onExit }) {
  const env = module.environment;
  const rain = env.weather === 'RAIN';

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-full overflow-y-auto rounded border-2 border-catYellow bg-ink p-6">
        <div className="font-condensed text-label uppercase tracking-wide text-catYellow">3D Cab Simulation</div>
        <div className="font-condensed font-bold text-4xl uppercase leading-tight">{module.title}</div>
        <p className="mt-1 text-white/80">{module.summary}</p>

        <div className="mt-4 flex flex-wrap gap-2 font-condensed font-bold uppercase">
          <span className="inline-flex items-center gap-1.5 rounded border-2 border-white/30 px-2.5 py-1">
            {rain ? <CloudRain size={18} strokeWidth={2.5} /> : <Sun size={18} strokeWidth={2.5} />}
            {rain ? 'Rain' : 'Clear'} · {env.ambientTempC}°C
          </span>
          {env.visibility === 'LOW' && (
            <span className="inline-flex items-center gap-1.5 rounded border-2 border-warn text-warn px-2.5 py-1">
              <EyeOff size={18} strokeWidth={2.5} />
              Low visibility
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded border-2 border-white/30 px-2.5 py-1">
            <Clock size={18} strokeWidth={2.5} />
            {module.durationMin} min
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border-2 border-catYellow text-catYellow px-2.5 py-1">
            <Award size={18} strokeWidth={2.5} />
            {module.xp} XP
          </span>
        </div>

        <div className="mt-5 font-condensed text-label uppercase tracking-wide text-white/60">You will</div>
        <ol className="mt-1 space-y-1">
          {module.objectives.map((o, i) => (
            <li key={o} className="flex gap-3">
              <span className="font-condensed font-bold text-catYellow font-tabular">{i + 1}</span>
              <span>{o}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 font-condensed text-label uppercase tracking-wide text-white/60">Controls</div>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-base">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="font-condensed font-bold uppercase w-28 shrink-0">{k}</span>
              <span className="text-white/75">{v}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <PrimaryButton icon={Play} onClick={onStart}>
            Start simulation
          </PrimaryButton>
          <PrimaryButton icon={ArrowLeft} tone="secondary" onClick={onExit}>
            Back to E-Learning
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
