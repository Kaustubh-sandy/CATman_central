import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide } from 'three';
import Interactive from './Interactive';
import Monitor from './Monitor';
import { approach } from '../machineModel';

const FRAME = '#25272a';
const PANEL = '#3a3e43';
const CONSOLE = '#2b2e32';
const SEAT = '#1c1e21';
const GLASS = '#a9cde0';
const BELT = '#E8740C';
const CHROME = '#c9ccd1';

function Box({ args, position, rotation, color, roughness = 0.8, metalness = 0 }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

function Glass({ args, position, rotation }) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={args} />
      <meshStandardMaterial color={GLASS} transparent opacity={0.1} roughness={0.05} metalness={0.3} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

function Shell() {
  return (
    <group>
      {/* floor, roof */}
      <Box args={[1.14, 0.05, 1.85]} position={[-0.55, 1.25, -0.025]} color="#161616" roughness={1} />
      <Box args={[1.2, 0.07, 1.92]} position={[-0.55, 2.97, -0.025]} color={FRAME} />
      <Box args={[1.1, 0.02, 1.8]} position={[-0.55, 2.93, -0.025]} color="#4a4e54" roughness={1} />

      {/* pillars */}
      {[
        [-1.1, -0.93],
        [0.0, -0.93],
        [-1.1, 0.88],
        [0.0, 0.88],
      ].map(([x, z]) => (
        <Box key={`${x}${z}`} args={[0.06, 1.72, 0.06]} position={[x, 2.1, z]} color={FRAME} />
      ))}
      <Box args={[0.05, 1.7, 0.05]} position={[-1.1, 2.1, 0.12]} color={FRAME} />

      {/* front: lower + upper glass with cross bar */}
      <Box args={[1.14, 0.05, 0.05]} position={[-0.55, 1.75, -0.93]} color={FRAME} />
      <Box args={[1.14, 0.06, 0.06]} position={[-0.55, 2.93, -0.93]} color={FRAME} />
      <Glass args={[1.08, 1.15]} position={[-0.55, 2.35, -0.94]} />
      <Glass args={[1.08, 0.45]} position={[-0.55, 1.5, -0.94]} />
      {/* wiper */}
      <Box args={[0.55, 0.012, 0.012]} position={[-0.62, 1.95, -0.92]} rotation={[0, 0, 0.5]} color="#111" />

      {/* right side: solid lower panel + glass */}
      <Box args={[0.03, 0.62, 1.85]} position={[0.01, 1.56, -0.025]} color={PANEL} />
      <Glass args={[1.8, 1.05]} position={[0.01, 2.4, -0.025]} rotation={[0, Math.PI / 2, 0]} />

      {/* left side: door */}
      <Box args={[0.03, 0.45, 1.85]} position={[-1.11, 1.47, -0.025]} color={PANEL} />
      <Glass args={[1.8, 1.25]} position={[-1.11, 2.3, -0.025]} rotation={[0, Math.PI / 2, 0]} />
      <Box args={[0.04, 0.03, 0.16]} position={[-1.08, 1.8, -0.35]} color={CHROME} metalness={0.8} roughness={0.3} />

      {/* rear wall + window */}
      <Box args={[1.14, 0.9, 0.04]} position={[-0.55, 1.7, 0.9]} color={PANEL} />
      <Glass args={[1.08, 0.78]} position={[-0.55, 2.54, 0.9]} />

      {/* dome light */}
      <Box args={[0.18, 0.02, 0.08]} position={[-0.55, 2.91, 0.45]} color="#e8e4d8" />
    </group>
  );
}

function Seat() {
  return (
    <group>
      <Box args={[0.36, 0.3, 0.36]} position={[-0.55, 1.42, 0.35]} color="#0f0f10" />
      <Box args={[0.56, 0.12, 0.5]} position={[-0.55, 1.62, 0.33]} color={SEAT} roughness={1} />
      <Box args={[0.56, 0.72, 0.12]} position={[-0.55, 2.02, 0.63]} rotation={[0.12, 0, 0]} color={SEAT} roughness={1} />
      <Box args={[0.32, 0.2, 0.1]} position={[-0.55, 2.47, 0.7]} rotation={[0.12, 0, 0]} color={SEAT} roughness={1} />
    </group>
  );
}

function Consoles() {
  return (
    <group>
      <Box args={[0.22, 0.3, 0.8]} position={[-0.97, 1.75, 0.22]} color={CONSOLE} />
      <Box args={[0.22, 0.3, 0.8]} position={[-0.13, 1.75, 0.22]} color={CONSOLE} />
      <Box args={[0.16, 0.06, 0.34]} position={[-0.97, 1.93, 0.42]} color={SEAT} roughness={1} />
      <Box args={[0.16, 0.06, 0.34]} position={[-0.13, 1.93, 0.62]} color={SEAT} roughness={1} />
      {/* switch panel on right console */}
      <Box args={[0.18, 0.012, 0.16]} position={[-0.13, 1.906, 0.3]} color="#1a1c1f" />
    </group>
  );
}

function Joystick({ side, position, simRef, hinted, onControl }) {
  const pivot = useRef();

  useFrame(() => {
    const s = simRef.current.stick[side];
    pivot.current.rotation.x = -s.y * 0.35;
    pivot.current.rotation.z = -s.x * 0.35;
  });

  const id = `${side}Stick`;
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.05, 0.065, 0.03, 20]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <group ref={pivot}>
        <Interactive
          id={id}
          label={side === 'left' ? 'Left joystick' : 'Right joystick'}
          onActivate={onControl}
          hinted={hinted === id}
          haloPosition={[0, 0.18, 0]}
          haloRadius={0.08}
        >
          <mesh position={[0, 0.04, 0]}>
            <coneGeometry args={[0.045, 0.07, 16]} />
            <meshStandardMaterial color="#141414" roughness={1} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
            <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.19, 0]} rotation={[0.25, 0, 0]}>
            <capsuleGeometry args={[0.028, 0.07, 6, 12]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
          </mesh>
        </Interactive>
        {side === 'right' && (
          <Interactive id="horn" label="Horn" onActivate={onControl} hinted={hinted === 'horn'} haloPosition={[0, 0.245, -0.015]} haloRadius={0.035}>
            <mesh position={[0, 0.245, -0.015]}>
              <cylinderGeometry args={[0.013, 0.013, 0.014, 14]} />
              <meshStandardMaterial color="#D62828" emissive="#5a0000" />
            </mesh>
          </Interactive>
        )}
      </group>
    </group>
  );
}

function LockoutLever({ simRef, hinted, onControl }) {
  const pivot = useRef();

  useFrame((_, dt) => {
    const target = simRef.current.machine.locked ? 1.0 : -0.05;
    pivot.current.rotation.x = approach(pivot.current.rotation.x, target, 5 * dt);
  });

  return (
    <group position={[-1.095, 1.84, -0.1]}>
      <group ref={pivot} rotation={[simRef.current.machine.locked ? 1.0 : -0.05, 0, 0]}>
        <Interactive id="lockout" label="Hydraulic lockout" onActivate={onControl} hinted={hinted === 'lockout'} haloPosition={[0, 0, -0.22]} haloRadius={0.06}>
          <mesh position={[0, 0, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 10]} />
            <meshStandardMaterial color="#303030" metalness={0.5} />
          </mesh>
          <mesh position={[0, 0, -0.23]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.02, 0.07, 6, 12]} />
            <meshStandardMaterial color="#D62828" roughness={0.5} />
          </mesh>
        </Interactive>
      </group>
    </group>
  );
}

function KeySwitch({ simRef, hinted, onControl }) {
  const key = useRef();

  useFrame((_, dt) => {
    const target = simRef.current.machine.engineOn ? -1.2 : 0;
    key.current.rotation.y = approach(key.current.rotation.y, target, 6 * dt);
  });

  return (
    <group position={[-0.1, 1.915, 0.34]}>
      <Interactive id="key" label="Engine key" onActivate={onControl} hinted={hinted === 'key'} haloPosition={[0, 0.03, 0]} haloRadius={0.05}>
        <mesh>
          <cylinderGeometry args={[0.026, 0.026, 0.012, 20]} />
          <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3} />
        </mesh>
        <group ref={key}>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.008, 0.03, 0.018]} />
            <meshStandardMaterial color="#9a9ea5" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.012, 0.03, 0.04]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      </Interactive>
    </group>
  );
}

function ThrottleDial({ simRef, hinted, onControl }) {
  const dial = useRef();

  useFrame((_, dt) => {
    const target = simRef.current.machine.throttleHigh ? -2.4 : 0;
    dial.current.rotation.y = approach(dial.current.rotation.y, target, 6 * dt);
  });

  return (
    <group position={[-0.16, 1.93, 0.24]}>
      <Interactive id="throttle" label="Throttle dial" onActivate={onControl} hinted={hinted === 'throttle'} haloRadius={0.055}>
        <group ref={dial}>
          <mesh>
            <cylinderGeometry args={[0.035, 0.038, 0.035, 24]} />
            <meshStandardMaterial color="#202226" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.019, -0.02]}>
            <boxGeometry args={[0.008, 0.004, 0.028]} />
            <meshStandardMaterial color="#FFCD11" />
          </mesh>
        </group>
      </Interactive>
    </group>
  );
}

function Seatbelt({ simRef, hinted, onControl }) {
  const fastened = useRef();
  const retracted = useRef();

  useFrame(() => {
    const on = simRef.current.machine.seatbelt;
    fastened.current.visible = on;
    retracted.current.visible = !on;
  });

  return (
    <Interactive id="seatbelt" label="Seatbelt" onActivate={onControl} hinted={hinted === 'seatbelt'} haloPosition={[-0.82, 1.7, 0.3]} haloRadius={0.07}>
      <mesh position={[-0.82, 1.69, 0.3]}>
        <boxGeometry args={[0.05, 0.035, 0.08]} />
        <meshStandardMaterial color="#D62828" />
      </mesh>
      <mesh ref={fastened} position={[-0.55, 1.72, 0.26]}>
        <boxGeometry args={[0.56, 0.012, 0.05]} />
        <meshStandardMaterial color={BELT} roughness={0.9} />
      </mesh>
      <mesh ref={retracted} position={[-0.28, 1.78, 0.46]}>
        <boxGeometry args={[0.05, 0.26, 0.012]} />
        <meshStandardMaterial color={BELT} roughness={0.9} />
      </mesh>
    </Interactive>
  );
}

function TravelControls() {
  return (
    <group position={[-0.55, 1.275, -0.55]}>
      {[-0.08, 0.08].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.25, 0.03]} rotation={[-0.15, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.5, 10]} />
            <meshStandardMaterial color="#303030" metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.5, 0.07]}>
            <capsuleGeometry args={[0.022, 0.05, 6, 12]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[0, 0.03, 0.12]} rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.1, 0.02, 0.2]} />
            <meshStandardMaterial color="#2a2a2a" metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Cab({ simRef, hinted, onControl }) {
  return (
    <group>
      <Shell />
      <Seat />
      <Consoles />
      <TravelControls />
      <Joystick side="left" position={[-0.97, 1.9, 0.0]} simRef={simRef} hinted={hinted} onControl={onControl} />
      <Joystick side="right" position={[-0.13, 1.9, 0.0]} simRef={simRef} hinted={hinted} onControl={onControl} />
      <LockoutLever simRef={simRef} hinted={hinted} onControl={onControl} />
      <KeySwitch simRef={simRef} hinted={hinted} onControl={onControl} />
      <ThrottleDial simRef={simRef} hinted={hinted} onControl={onControl} />
      <Seatbelt simRef={simRef} hinted={hinted} onControl={onControl} />
      <Monitor simRef={simRef} hinted={hinted} onControl={onControl} />
      <pointLight position={[-0.55, 2.8, 0.2]} intensity={0.8} distance={3} decay={2} />
    </group>
  );
}
