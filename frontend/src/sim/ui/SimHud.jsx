import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Power,
  Lightbulb,
  Info,
} from 'lucide-react';
import TouchPad from './TouchPad';

const TONE = {
  ok: { cls: 'border-ok text-ok bg-ok/15', Icon: CheckCircle2 },
  warn: { cls: 'border-warn text-warn bg-warn/15', Icon: AlertTriangle },
  danger: { cls: 'border-danger text-danger bg-danger/15', Icon: AlertOctagon },
  neutral: { cls: 'border-white/40 text-white bg-black/40', Icon: Power },
  info: { cls: 'border-white/40 text-white bg-black/80', Icon: Info },
};

function Chip({ tone, text }) {
  const { cls, Icon } = TONE[tone];
  return (
    <span className={`hidden lg:inline-flex items-center gap-1.5 rounded border-2 px-2.5 py-1 font-condensed font-bold uppercase tracking-wide ${cls}`}>
      <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
      {text}
    </span>
  );
}

function Toast({ tone, text }) {
  const { cls, Icon } = TONE[tone];
  return (
    <div className={`pointer-events-none flex items-center gap-3 rounded border-2 px-4 py-2.5 font-condensed text-xl font-bold shadow-none ${cls} bg-black/85`}>
      <Icon size={26} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Countdown({ deadline, totalSec }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const leftSec = Math.max(0, (deadline - now) / 1000);
  const pct = Math.min(100, (leftSec / totalSec) * 100);
  return (
    <div className="mt-3">
      <div className="h-3 w-full rounded border-2 border-border bg-black/60 overflow-hidden">
        <div className="h-full bg-danger transition-[width] duration-100" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-right font-tabular font-condensed font-bold text-danger">{leftSec.toFixed(1)} s</div>
    </div>
  );
}

function PromptCard({ node, state, hintOn, onToggleHint, onChoose }) {
  const isDecision = node.kind === 'DECISION';
  const alert = node.alert;
  const visibleChoices = isDecision ? node.choices.filter((c) => !c.hidden) : [];

  return (
    <div
      className={`pointer-events-auto w-full max-w-2xl rounded border-2 p-4 bg-black/85 ${
        alert ? 'border-danger' : 'border-catYellow'
      }`}
    >
      <div className="flex items-start gap-3">
        {alert ? (
          <AlertOctagon className="text-danger shrink-0 mt-1" size={36} strokeWidth={2.5} aria-hidden="true" />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className={`font-condensed font-bold text-3xl leading-tight uppercase ${alert ? 'text-danger' : 'text-white'}`}>
            {node.prompt}
          </div>
          {node.detail && <div className="text-white/75 mt-1">{node.detail}</div>}
        </div>
        {node.hintTarget && (
          <button
            type="button"
            onClick={onToggleHint}
            className={`shrink-0 h-touch px-3 rounded border-2 font-condensed font-bold uppercase flex items-center gap-2 ${
              hintOn ? 'bg-catYellow text-ink border-catYellow' : 'border-white/40 text-white'
            }`}
          >
            <Lightbulb size={22} strokeWidth={2.5} aria-hidden="true" />
            Show me
          </button>
        )}
      </div>

      {isDecision && node.timeoutSec && state.deadline && <Countdown key={state.nodeId} deadline={state.deadline} totalSec={node.timeoutSec} />}

      {isDecision && (
        <div className="mt-3 flex flex-col gap-3">
          {visibleChoices.map((choice) => (
            <button
              key={choice.text}
              type="button"
              onClick={() => onChoose(choice)}
              className="w-full min-h-touch rounded border-2 border-white/40 bg-white/5 px-4 py-3 text-left font-condensed text-xl font-bold hover:border-catYellow hover:bg-catYellow/10"
            >
              {choice.text}
              {choice.actions?.length ? (
                <span className="ml-2 text-sm font-semibold text-white/60">(or do it in the cab)</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SimHud({ module, state, node, maxScore, hud, feedback, notice, hintOn, onToggleHint, onChoose, onExit, simRef }) {
  const running = state.status === 'RUNNING';

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col text-white">
      <div className="pointer-events-auto flex items-center gap-3 border-b-2 border-border bg-black/75 px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="h-touch px-4 rounded border-2 border-white/40 font-condensed font-bold uppercase flex items-center gap-2 hover:border-white"
        >
          <ArrowLeft size={24} strokeWidth={2.5} aria-hidden="true" />
          Exit
        </button>
        <div className="min-w-0">
          <div className="font-condensed text-sm uppercase tracking-wide text-white/60">3D Simulation</div>
          <div className="font-condensed font-bold text-2xl leading-tight truncate">{module.title}</div>
        </div>
        <div className="flex-1" />
        <Chip tone={hud.engineOn ? 'ok' : 'neutral'} text={hud.engineOn ? 'Engine on' : 'Engine off'} />
        <Chip tone={hud.seatbelt ? 'ok' : 'danger'} text={hud.seatbelt ? 'Belt on' : 'Belt off'} />
        <Chip tone={hud.locked ? 'warn' : 'ok'} text={hud.locked ? 'Hydraulics locked' : 'Hydraulics active'} />
        <div className="pl-2 font-condensed font-bold text-3xl font-tabular">
          {state.score}
          <span className="text-base text-white/60"> / {maxScore}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2 px-4">
        {feedback && <Toast tone={feedback.ok ? 'ok' : 'danger'} text={feedback.text} />}
        {notice && <Toast tone={notice.tone} text={notice.text} />}
      </div>

      <div className="flex-1" />

      {running && (
        <div className="flex items-end gap-4 p-4">
          <div className="hidden md:block">
            <TouchPad side="left" title="Left" subtitle="Arm · Swing (WASD)" simRef={simRef} />
          </div>
          <div className="flex-1 flex justify-center">
            <PromptCard node={node} state={state} hintOn={hintOn} onToggleHint={onToggleHint} onChoose={onChoose} />
          </div>
          <div className="hidden md:block">
            <TouchPad side="right" title="Right" subtitle="Boom · Bucket (arrows)" simRef={simRef} />
          </div>
        </div>
      )}
    </div>
  );
}
