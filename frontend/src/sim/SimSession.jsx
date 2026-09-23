import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import CabScene from './scene/CabScene';
import SimHud from './ui/SimHud';
import SimIntro from './ui/SimIntro';
import SimResults from './ui/SimResults';
import { useScenario } from './scenarioEngine';
import { createMachineState, EYE } from './machineModel';
import { playHorn } from './audio';
import { apiClient } from '../api/client';

const HORN_MS = 600;
const TOAST_MS = 3500;
const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyI', 'KeyJ', 'KeyK', 'KeyL',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const CONTROL_KEYS = { KeyB: 'seatbelt', KeyE: 'key', KeyQ: 'lockout', KeyT: 'throttle', KeyH: 'horn', KeyM: 'monitor' };

function createSimState(module) {
  return {
    machine: createMachineState(module.initialState),
    scene: { workerMode: module.initialScene?.workerMode || null },
    keys: new Set(),
    touch: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
    stick: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
  };
}

function hudSnapshot(m) {
  return { engineOn: m.engineOn, seatbelt: m.seatbelt, locked: m.locked };
}

export default function SimSession({ module, onExit, onRetry }) {
  const simRef = useRef(null);
  if (!simRef.current) simRef.current = createSimState(module);

  const [notice, setNotice] = useState(null);
  const [hintOn, setHintOn] = useState(false);
  const [hud, setHud] = useState(() => hudSnapshot(simRef.current.machine));
  const [visibleFeedback, setVisibleFeedback] = useState(null);

  const showNotice = useCallback((text, tone = 'info') => {
    setNotice({ text, tone, id: Date.now() });
  }, []);

  const applySceneEvent = useCallback((event) => {
    const sim = simRef.current;
    if (event.startsWith('TEMP_')) sim.machine.tempMode = event.slice('TEMP_'.length);
    if (event.startsWith('WORKER_')) sim.scene.workerMode = event.slice('WORKER_'.length);
  }, []);

  const scenario = useScenario(module, simRef, applySceneEvent);
  const { state, addViolation, handleAction } = scenario;
  const running = state.status === 'RUNNING';
  const node = module.nodes[state.nodeId];

  const perform = useCallback(
    (control) => {
      if (state.status !== 'RUNNING') return;
      const m = simRef.current.machine;
      let action = null;

      switch (control) {
        case 'seatbelt':
          if (m.seatbelt) {
            if (m.engineOn && !m.locked) addViolation('BELT_OFF_ACTIVE', 'Seatbelt removed with hydraulics active');
            m.seatbelt = false;
            action = 'SEATBELT_OFF';
          } else {
            m.seatbelt = true;
            action = 'SEATBELT_ON';
          }
          break;
        case 'key':
          if (m.engineOn) {
            m.engineOn = false;
            action = 'ENGINE_STOP';
          } else {
            if (!m.locked) {
              showNotice("Engine won't start — lock the hydraulics first", 'warn');
              return;
            }
            if (!m.seatbelt) addViolation('START_NO_BELT', 'Started the engine without seatbelt');
            m.engineOn = true;
            action = 'ENGINE_START';
          }
          break;
        case 'lockout':
          m.locked = !m.locked;
          action = m.locked ? 'LOCK_HYDRAULICS' : 'UNLOCK_HYDRAULICS';
          break;
        case 'throttle':
          if (!m.engineOn) {
            showNotice('Start the engine first', 'warn');
            return;
          }
          m.throttleHigh = !m.throttleHigh;
          action = m.throttleHigh ? 'THROTTLE_HIGH' : 'THROTTLE_LOW';
          break;
        case 'horn':
          m.hornUntil = performance.now() + HORN_MS;
          playHorn();
          action = 'HORN';
          break;
        case 'monitor':
          action = 'CHECK_DISPLAY';
          break;
        case 'leftStick':
          showNotice('Left stick: W A S D, or the left pad', 'info');
          return;
        case 'rightStick':
          showNotice('Right stick: arrow keys / I J K L, or the right pad', 'info');
          return;
        default:
          return;
      }

      setHud(hudSnapshot(m));
      handleAction(action);
    },
    [state.status, addViolation, handleAction, showNotice]
  );

  // Keyboard
  useEffect(() => {
    const sim = simRef.current;
    const onDown = (e) => {
      if (MOVEMENT_KEYS.has(e.code)) {
        e.preventDefault();
        sim.keys.add(e.code);
      } else if (CONTROL_KEYS[e.code] && !e.repeat) {
        perform(CONTROL_KEYS[e.code]);
      }
    };
    const onUp = (e) => sim.keys.delete(e.code);
    const onBlur = () => sim.keys.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [perform]);

  // Keep HUD chips in sync with state changed by the scenario itself (e.g. auto events).
  useEffect(() => {
    const id = setInterval(() => {
      const next = hudSnapshot(simRef.current.machine);
      setHud((prev) =>
        prev.engineOn === next.engineOn && prev.seatbelt === next.seatbelt && prev.locked === next.locked ? prev : next
      );
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setHintOn(false);
  }, [state.nodeId]);

  // Save the result once the scenario ends (training progress + XP in Firestore).
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (state.status !== 'DONE') return;
    apiClient
      .post(`/training/modules/${module.id}/complete`, {
        score: state.score,
        maxScore: scenario.maxScore,
        outcome: state.outcome,
        violations: state.violations.map((v) => v.code),
        hintsUsed: state.hintsUsed,
      })
      .then((res) => setSaved(res.data.record))
      .catch(() => setSaved({ error: true }));
  }, [state.status]); // only on the transition to DONE; the other values are final by then
  useEffect(() => {
    if (!state.feedback) return undefined;
    setVisibleFeedback(state.feedback);
    const id = setTimeout(() => setVisibleFeedback(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [state.feedback]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => () => {
    document.body.style.cursor = 'auto';
  }, []);

  const toggleHint = () => {
    if (!hintOn) scenario.markHintUsed();
    setHintOn((h) => !h);
  };

  const hinted = running && hintOn ? node.hintTarget : null;

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas camera={{ position: EYE, fov: 75, near: 0.03, far: 800 }} dpr={[1, 1.75]}>
        <CabScene
          simRef={simRef}
          module={module}
          hinted={hinted}
          showSwingRadius={!!module.environment.showSwingRadius || hintOn}
          running={running}
          onControl={perform}
          onAction={scenario.handleAction}
          onViolation={scenario.addViolation}
          onNotice={showNotice}
        />
      </Canvas>

      <SimHud
        module={module}
        state={state}
        node={node}
        maxScore={scenario.maxScore}
        hud={hud}
        feedback={visibleFeedback}
        notice={notice}
        hintOn={hintOn}
        onToggleHint={toggleHint}
        onChoose={scenario.choose}
        onExit={onExit}
        simRef={simRef}
      />

      {state.status === 'INTRO' && <SimIntro module={module} onStart={scenario.start} onExit={onExit} />}
      {state.status === 'DONE' && (
        <SimResults module={module} state={state} maxScore={scenario.maxScore} saved={saved} onRetry={onRetry} onExit={onExit} />
      )}
    </div>
  );
}
