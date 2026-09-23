import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

const HIVIS = '#FF6A00';
const REFLECTIVE = '#e6e6e6';

// World-frame point at a heading (radians, + = left of forward) and distance from the swing centre.
function pointAt(heading, distance) {
  return new Vector3(-Math.sin(heading) * distance, 0, -Math.cos(heading) * distance);
}

// Placements are relative to where the cab is facing when the event starts.
const PLACEMENT = {
  IDLE_FAR: { heading: -2.3, distance: 15 },
  APPROACH: { fromHeading: 0.55, fromDistance: 16, toHeading: 0.35, toDistance: 4.6, durationSec: 5.5 },
  LEAVE: { toDistance: 18, headingShift: 0.4, durationSec: 5 },
};

export default function Worker({ simRef }) {
  const root = useRef();
  const legL = useRef();
  const legR = useRef();
  const armR = useRef();
  const walk = useRef({ mode: null, pos: new Vector3(), from: null, to: null, t: 1, duration: 1 });

  useFrame(({ clock }, dt) => {
    const sim = simRef.current;
    const mode = sim.scene.workerMode;
    const w = walk.current;
    const swing = sim.machine.swing;

    if (mode !== w.mode) {
      w.mode = mode;
      if (mode === 'IDLE_FAR') {
        w.pos.copy(pointAt(swing + PLACEMENT.IDLE_FAR.heading, PLACEMENT.IDLE_FAR.distance));
        w.from = null;
      } else if (mode === 'APPROACH') {
        const p = PLACEMENT.APPROACH;
        w.from = pointAt(swing + p.fromHeading, p.fromDistance);
        w.to = pointAt(swing + p.toHeading, p.toDistance);
        w.pos.copy(w.from);
        w.t = 0;
        w.duration = p.durationSec;
      } else if (mode === 'LEAVE') {
        const p = PLACEMENT.LEAVE;
        const heading = Math.atan2(-w.pos.x, -w.pos.z) + p.headingShift;
        w.from = w.pos.clone();
        w.to = pointAt(heading, p.toDistance);
        w.t = 0;
        w.duration = p.durationSec;
      } else {
        w.from = null;
      }
    }

    const visible = !!mode;
    root.current.visible = visible;
    if (!visible) {
      sim.machine.nearestPersonM = null;
      return;
    }

    const walking = w.from && w.t < 1;
    if (walking) {
      w.t = Math.min(1, w.t + dt / w.duration);
      w.pos.lerpVectors(w.from, w.to, w.t);
      root.current.rotation.y = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
    } else if (mode === 'STOP_WAVE' || mode === 'IDLE_FAR') {
      root.current.rotation.y = Math.atan2(-w.pos.x, -w.pos.z);
    }

    root.current.position.copy(w.pos);
    const stride = walking ? Math.sin(clock.elapsedTime * 9) * 0.5 : 0;
    legL.current.rotation.x = stride;
    legR.current.rotation.x = -stride;
    armR.current.rotation.x = mode === 'STOP_WAVE' ? Math.PI : -stride * 0.6;
    armR.current.rotation.z = mode === 'STOP_WAVE' ? Math.sin(clock.elapsedTime * 8) * 0.4 : 0;

    sim.machine.nearestPersonM = w.pos.length();
  });

  return (
    <group ref={root} visible={false}>
      <group ref={legL} position={[-0.1, 0.9, 0]}>
        <mesh position={[0, -0.45, 0]}>
          <boxGeometry args={[0.14, 0.9, 0.16]} />
          <meshStandardMaterial color="#2b3a55" />
        </mesh>
      </group>
      <group ref={legR} position={[0.1, 0.9, 0]}>
        <mesh position={[0, -0.45, 0]}>
          <boxGeometry args={[0.14, 0.9, 0.16]} />
          <meshStandardMaterial color="#2b3a55" />
        </mesh>
      </group>
      <mesh position={[0, 1.22, 0]}>
        <boxGeometry args={[0.44, 0.62, 0.26]} />
        <meshStandardMaterial color={HIVIS} />
      </mesh>
      {[1.1, 1.32].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.45, 0.05, 0.27]} />
          <meshStandardMaterial color={REFLECTIVE} emissive="#555" />
        </mesh>
      ))}
      <group position={[-0.28, 1.48, 0]}>
        <mesh position={[0, -0.3, 0]}>
          <boxGeometry args={[0.11, 0.6, 0.13]} />
          <meshStandardMaterial color={HIVIS} />
        </mesh>
      </group>
      <group ref={armR} position={[0.28, 1.48, 0]}>
        <mesh position={[0, -0.3, 0]}>
          <boxGeometry args={[0.11, 0.6, 0.13]} />
          <meshStandardMaterial color={HIVIS} />
        </mesh>
      </group>
      <mesh position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial color="#b77b4b" />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#FFCD11" />
      </mesh>
    </group>
  );
}
