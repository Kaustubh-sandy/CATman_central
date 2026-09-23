import { CheckCircle2, AlertOctagon, RotateCcw, ArrowLeft, Award } from 'lucide-react';
import PrimaryButton from '../../components/PrimaryButton';
import { PASS_RATIO } from '../scenarioEngine';

export default function SimResults({ module, state, maxScore, onRetry, onExit }) {
  const endNode = module.nodes[state.nodeId];
  const ratio = maxScore > 0 ? Math.max(0, state.score) / maxScore : 0;
  const passed = state.outcome !== 'FAIL' && ratio >= PASS_RATIO;
  const xp = passed ? Math.round(module.xp * Math.min(1, ratio)) : 0;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
      <div className={`w-full max-w-2xl max-h-full overflow-y-auto rounded border-2 bg-ink p-6 ${passed ? 'border-ok' : 'border-danger'}`}>
        <div className={`flex items-center gap-3 ${passed ? 'text-ok' : 'text-danger'}`}>
          {passed ? <CheckCircle2 size={48} strokeWidth={2.5} /> : <AlertOctagon size={48} strokeWidth={2.5} />}
          <div className="font-condensed font-bold text-figure uppercase">{passed ? 'Passed' : 'Not passed'}</div>
        </div>
        {endNode?.feedback && <p className="mt-2 text-lg text-white/85">{endNode.feedback}</p>}

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded border-2 border-border p-3">
            <div className="font-condensed text-sm uppercase text-white/60">Score</div>
            <div className="font-condensed font-bold text-4xl font-tabular">
              {state.score}
              <span className="text-lg text-white/60">/{maxScore}</span>
            </div>
          </div>
          <div className="rounded border-2 border-border p-3">
            <div className="font-condensed text-sm uppercase text-white/60">Safety</div>
            <div className={`font-condensed font-bold text-4xl font-tabular ${state.violations.length ? 'text-danger' : 'text-ok'}`}>
              {state.violations.length}
              <span className="text-lg text-white/60"> issues</span>
            </div>
          </div>
          <div className="rounded border-2 border-border p-3">
            <div className="font-condensed text-sm uppercase text-white/60">XP</div>
            <div className="font-condensed font-bold text-4xl font-tabular text-catYellow flex items-center gap-1">
              <Award size={28} strokeWidth={2.5} />+{xp}
            </div>
          </div>
        </div>

        {state.violations.length > 0 && (
          <div className="mt-5">
            <div className="font-condensed text-label uppercase tracking-wide text-danger">Safety issues</div>
            <ul className="mt-1 space-y-1">
              {state.violations.map((v) => (
                <li key={v.code} className="flex items-center gap-2 text-danger">
                  <AlertOctagon size={18} strokeWidth={2.5} className="shrink-0" />
                  {v.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 font-condensed text-label uppercase tracking-wide text-white/60">Your steps</div>
        <ul className="mt-1 divide-y-2 divide-border rounded border-2 border-border">
          {state.log.map((entry, i) => (
            <li key={i} className="flex gap-3 p-3">
              {entry.ok ? (
                <CheckCircle2 className="text-ok shrink-0 mt-0.5" size={22} strokeWidth={2.5} />
              ) : (
                <AlertOctagon className="text-danger shrink-0 mt-0.5" size={22} strokeWidth={2.5} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-condensed font-bold uppercase">{entry.prompt}</div>
                <div className="text-white/75">{entry.result}</div>
                {entry.feedback && !entry.ok && <div className="text-sm text-white/60 mt-0.5">{entry.feedback}</div>}
              </div>
              <div className={`font-condensed font-bold font-tabular ${entry.score >= 0 ? 'text-ok' : 'text-danger'}`}>
                {entry.score > 0 ? `+${entry.score}` : entry.score}
              </div>
            </li>
          ))}
        </ul>
        {state.hintsUsed > 0 && <div className="mt-2 text-sm text-white/60">Hints used: {state.hintsUsed}</div>}

        <div className="mt-6 flex flex-col gap-4">
          <PrimaryButton icon={RotateCcw} onClick={onRetry}>
            Try again
          </PrimaryButton>
          <PrimaryButton icon={ArrowLeft} tone="secondary" onClick={onExit}>
            Back to E-Learning
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
