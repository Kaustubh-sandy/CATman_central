import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { EYE } from '../machineModel';

// Where each hint target sits in the cab, so "Show me" can turn the view to it.
const HINT_POINTS = {
  seatbelt: [-0.82, 1.7, 0.3],
  monitor: [-0.12, 2.02, -0.72],
  key: [-0.1, 1.92, 0.34],
  throttle: [-0.16, 1.93, 0.24],
  horn: [-0.13, 2.15, -0.015],
  lockout: [-1.095, 1.84, -0.3],
  leftStick: [-0.97, 2.05, 0],
  rightStick: [-0.13, 2.05, 0],
};

const TURN_SEC = 0.7;
const TARGET_DIST = 0.01;

export default function CameraGuide({ hinted }) {
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);
  const eye = useMemo(() => new Vector3(...EYE), []);
  const anim = useRef(null);

  useEffect(() => {
    if (!hinted || !controls || !HINT_POINTS[hinted]) return;
    const from = new Vector3().subVectors(controls.target, camera.position).normalize();
    const to = new Vector3(...HINT_POINTS[hinted]).sub(eye).normalize();
    anim.current = { from, to, t: 0 };
  }, [hinted, controls, camera, eye]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / TURN_SEC);
    const k = a.t * a.t * (3 - 2 * a.t);
    const dir = new Vector3().lerpVectors(a.from, a.to, k).normalize();
    camera.position.copy(eye);
    controls.target.copy(eye).addScaledVector(dir, TARGET_DIST);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });

  return null;
}
