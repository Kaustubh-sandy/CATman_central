import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const ACTION_LABELS = {
  SEATBELT_ON: 'Seatbelt fastened',
  SEATBELT_OFF: 'Seatbelt unfastened',
  ENGINE_START: 'Engine started',
  ENGINE_STOP: 'Engine stopped',
  LOCK_HYDRAULICS: 'Hydraulics locked',
  UNLOCK_HYDRAULICS: 'Hydraulics unlocked',
  THROTTLE_LOW: 'Throttle to idle',
  THROTTLE_HIGH: 'Throttle to high',
  HORN: 'Horn sounded',
  CHECK_DISPLAY: 'Monitor checked',
  BOOM_UP: 'Boom up',
  BOOM_DOWN: 'Boom down',
  ARM_IN: 'Arm in',
  ARM_OUT: 'Arm out',
  BUCKET_CURL: 'Bucket curl',
  BUCKET_DUMP: 'Bucket dump',
  SWING_LEFT: 'Swing left',
  SWING_RIGHT: 'Swing right',
  BUCKET_ON_GROUND: 'Bucket on the ground',
};

// Discrete controls that cost points when used at the wrong step.
const PENALIZED = new Set([
  'SEATBELT_ON', 'SEATBELT_OFF', 'ENGINE_START', 'ENGINE_STOP',
  'LOCK_HYDRAULICS', 'UNLOCK_HYDRAULICS', 'THROTTLE_LOW', 'THROTTLE_HIGH',
]);

// Joystick movement still held over from the previous step is ignored during a decision's grace period.
const MOVEMENT = new Set([
  'BOOM_UP', 'BOOM_DOWN', 'ARM_IN', 'ARM_OUT', 'BUCKET_CURL', 'BUCKET_DUMP', 'SWING_LEFT', 'SWING_RIGHT',
]);

// An ACTION step whose end state is already true on entry completes on its own.
const STATE_CHECKS = {
  SEATBELT_ON: (m) => m.seatbelt,
  SEATBELT_OFF: (m) => !m.seatbelt,
  ENGINE_START: (m) => m.engineOn,
  ENGINE_STOP: (m) => !m.engineOn,
  LOCK_HYDRAULICS: (m) => m.locked,
  UNLOCK_HYDRAULICS: (m) => !m.locked,
  THROTTLE_LOW: (m) => !m.throttleHigh,
  THROTTLE_HIGH: (m) => m.throttleHigh,
  BUCKET_ON_GROUND: (m) => m.onGround,
};

const WRONG_STEP_PENALTY = 2;
const VIOLATION_PENALTY = 5;
export const PASS_RATIO = 0.7;

export function computeMaxScore(module) {
  const memo = {};
  const best = (id, depth) => {
    const node = module.nodes[id];
    if (!node || node.kind === 'END' || depth > 50) return 0;
    if (memo[id] !== undefined) return memo[id];
    const value =
      node.kind === 'ACTION'
        ? (node.score || 0) + best(node.next, depth + 1)
        : Math.max(...node.choices.map((c) => (c.score || 0) + best(c.next, depth + 1)));
    memo[id] = value;
    return value;
  };
  return best(module.start, 0);
}

function feedbackOf(text, ok, critical = false) {
  return text ? { text, ok, critical, at: Date.now(), id: `${Date.now()}-${Math.random()}` } : null;
}

// A safety violation raised by the same click must stay on screen over a "wrong step" hint.
function keepCritical(prev, next) {
  return prev?.critical && Date.now() - prev.at < 1000 ? prev : next;
}

export function useScenario(module, simRef, applySceneEvent) {
  const [state, setState] = useState(() => ({
    status: 'INTRO',
    nodeId: module.start,
    nodeEnteredAt: 0,
    deadline: null,
    score: 0,
    log: [],
    violations: [],
    hintsUsed: 0,
    feedback: null,
    outcome: null,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const maxScore = useMemo(() => computeMaxScore(module), [module]);

  const advance = useCallback(
    (fromNodeId, entry) => {
      setState((prev) => {
        if (prev.status !== 'RUNNING' || prev.nodeId !== fromNodeId) return prev;
        const node = module.nodes[fromNodeId];
        const nextNode = module.nodes[entry.next];
        const score = prev.score + (entry.score || 0);
        const log = [
          ...prev.log,
          { prompt: node.prompt, result: entry.result, score: entry.score || 0, ok: entry.ok, feedback: entry.feedback || null },
        ];
        const feedback = feedbackOf(entry.feedback, entry.ok);

        if (!nextNode || nextNode.kind === 'END') {
          return { ...prev, status: 'DONE', nodeId: entry.next, score, log, feedback, deadline: null, outcome: nextNode?.outcome || 'PASS' };
        }
        return {
          ...prev,
          nodeId: entry.next,
          nodeEnteredAt: Date.now(),
          deadline: nextNode.timeoutSec ? Date.now() + nextNode.timeoutSec * 1000 : null,
          score,
          log,
          feedback,
        };
      });
    },
    [module]
  );

  const start = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'INTRO') return prev;
      const first = module.nodes[module.start];
      return {
        ...prev,
        status: 'RUNNING',
        nodeEnteredAt: Date.now(),
        deadline: first.timeoutSec ? Date.now() + first.timeoutSec * 1000 : null,
      };
    });
  }, [module]);

  const choose = useCallback(
    (choice) => {
      const s = stateRef.current;
      advance(s.nodeId, {
        next: choice.next,
        score: choice.score || 0,
        ok: (choice.score || 0) > 0,
        result: choice.text,
        feedback: choice.feedback,
      });
    },
    [advance]
  );

  const handleAction = useCallback(
    (action) => {
      const s = stateRef.current;
      if (s.status !== 'RUNNING') return;
      const node = module.nodes[s.nodeId];
      const label = ACTION_LABELS[action] || action;

      if (node.kind === 'ACTION') {
        if (node.expect.includes(action)) {
          advance(s.nodeId, { next: node.next, score: node.score || 0, ok: true, result: label, feedback: `${label} ✓` });
        } else if (PENALIZED.has(action)) {
          setState((prev) => {
            if (prev.status !== 'RUNNING' || prev.nodeId !== s.nodeId) return prev;
            return {
              ...prev,
              score: prev.score - WRONG_STEP_PENALTY,
              log: [...prev.log, { prompt: node.prompt, result: `Wrong step: ${label}`, score: -WRONG_STEP_PENALTY, ok: false }],
              feedback: keepCritical(prev.feedback, feedbackOf(`Not yet — ${node.prompt}`, false)),
            };
          });
        }
        return;
      }

      if (node.kind === 'DECISION') {
        const inGrace = node.graceSec && Date.now() - s.nodeEnteredAt < node.graceSec * 1000;
        if (inGrace && MOVEMENT.has(action)) return;
        const choice = node.choices.find((c) => c.actions?.includes(action));
        if (choice) choose(choice);
      }
    },
    [module, advance, choose]
  );

  const addViolation = useCallback((code, text) => {
    setState((prev) => {
      if (prev.status !== 'RUNNING' || prev.violations.some((v) => v.code === code)) return prev;
      return {
        ...prev,
        score: prev.score - VIOLATION_PENALTY,
        violations: [...prev.violations, { code, text }],
        feedback: feedbackOf(`STOP — ${text}`, false, true),
      };
    });
  }, []);

  const markHintUsed = useCallback(() => {
    setState((prev) => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }));
  }, []);

  // Node entry: scene events, decision timeouts, and already-satisfied steps.
  useEffect(() => {
    if (state.status !== 'RUNNING') return undefined;
    const nodeId = state.nodeId;
    const node = module.nodes[nodeId];
    if (node.sceneEvent) applySceneEvent(node.sceneEvent);

    const timers = [];
    if (node.kind === 'DECISION' && node.timeoutSec) {
      timers.push(
        setTimeout(() => {
          advance(nodeId, {
            next: node.timeoutNext,
            score: node.timeoutScore ?? -10,
            ok: false,
            result: 'No action in time',
            feedback: node.timeoutFeedback,
          });
        }, node.timeoutSec * 1000)
      );
    }
    if (node.kind === 'ACTION') {
      timers.push(
        setTimeout(() => {
          const m = simRef.current.machine;
          if (node.expect.some((a) => STATE_CHECKS[a]?.(m))) {
            advance(nodeId, { next: node.next, score: node.score || 0, ok: true, result: 'Already done', feedback: 'Already done ✓' });
          }
        }, 700)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [state.status, state.nodeId, module, advance, applySceneEvent, simRef]);

  return { state, maxScore, start, choose, handleAction, addViolation, markHintUsed };
}
