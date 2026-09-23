import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { approach, clamp, stepMachine, updateGroundContact } from '../machineModel';

// Radians of movement on one axis before it counts as a deliberate action.
const EMIT_THRESHOLD = 0.12;
const NOTICE_COOLDOWN_MS = 2500;

const AXIS_ACTIONS = {
  boom: ['BOOM_UP', 'BOOM_DOWN'],
  arm: ['ARM_OUT', 'ARM_IN'],
  bucket: ['BUCKET_DUMP', 'BUCKET_CURL'],
  swing: ['SWING_LEFT', 'SWING_RIGHT'],
};

function readSticks(sim) {
  const k = sim.keys;
  const key = (...codes) => (codes.some((c) => k.has(c)) ? 1 : 0);
  return {
    left: {
      x: clamp(key('KeyD') - key('KeyA') + sim.touch.left.x, -1, 1),
      y: clamp(key('KeyW') - key('KeyS') + sim.touch.left.y, -1, 1),
    },
    right: {
      x: clamp(key('ArrowRight', 'KeyL') - key('ArrowLeft', 'KeyJ') + sim.touch.right.x, -1, 1),
      y: clamp(key('ArrowUp', 'KeyI') - key('ArrowDown', 'KeyK') + sim.touch.right.y, -1, 1),
    },
  };
}

export default function MachineController({ simRef, running, onAction, onViolation, onNotice }) {
  const accumulated = useRef({ boom: 0, arm: 0, bucket: 0, swing: 0 });
  const lastNoticeAt = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const sim = simRef.current;
    const m = sim.machine;
    const { left, right } = running ? readSticks(sim) : { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

    ['left', 'right'].forEach((side) => {
      const target = side === 'left' ? left : right;
      sim.stick[side].x = approach(sim.stick[side].x, target.x, 6 * dt);
      sim.stick[side].y = approach(sim.stick[side].y, target.y, 6 * dt);
    });

    const { deltas, active, wantsMove } = stepMachine(m, left, right, dt);
    if (!running || !wantsMove) return;

    if (!active) {
      const now = performance.now();
      if (now - lastNoticeAt.current > NOTICE_COOLDOWN_MS) {
        lastNoticeAt.current = now;
        onNotice(m.engineOn ? 'Hydraulics locked — lower the lockout lever' : 'Engine is off', 'warn');
      }
      return;
    }

    if (!m.seatbelt) onViolation('NO_BELT_OPERATION', 'Operating without seatbelt');

    Object.entries(deltas).forEach(([axis, delta]) => {
      const acc = accumulated.current;
      if (delta === 0) return;
      if (Math.sign(delta) !== Math.sign(acc[axis])) acc[axis] = 0;
      acc[axis] += delta;
      if (Math.abs(acc[axis]) >= EMIT_THRESHOLD) {
        onAction(AXIS_ACTIONS[axis][acc[axis] > 0 ? 0 : 1]);
        acc[axis] = 0;
      }
    });

    if (updateGroundContact(m)) onAction('BUCKET_ON_GROUND');
  });

  return null;
}
