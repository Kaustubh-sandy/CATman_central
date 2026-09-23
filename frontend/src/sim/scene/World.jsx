import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import Worker from './Worker';
import Rain from './Rain';
import { SWING_RADIUS_M } from '../machineModel';

const DIRT = '#8a6d4b';
const YELLOW = '#F2B705';

function polar(heading, distance, y = 0) {
  return [-Math.sin(heading) * distance, y, -Math.cos(heading) * distance];
}

function DumpTruck({ heading, distance }) {
  return (
    <group position={polar(heading, distance)} rotation={[0, heading + Math.PI / 2, 0]}>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[2.6, 0.5, 7]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[0, 2.1, -2.6]}>
        <boxGeometry args={[2.4, 1.7, 1.7]} />
        <meshStandardMaterial color={YELLOW} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.4, -3.46]}>
        <boxGeometry args={[2.0, 0.8, 0.02]} />
        <meshStandardMaterial color="#1c2a33" roughness={0.1} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.25, 0.95]} rotation={[0.05, 0, 0]}>
        <boxGeometry args={[2.8, 1.4, 4.6]} />
        <meshStandardMaterial color={YELLOW} roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.0, 0.95]}>
        <boxGeometry args={[2.5, 0.2, 4.2]} />
        <meshStandardMaterial color="#6b4f33" roughness={1} />
      </mesh>
      {[-2.6, 0.5, 2.2].flatMap((z) =>
        [-1.35, 1.35].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.75, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.75, 0.75, 0.5, 20]} />
            <meshStandardMaterial color="#161616" roughness={0.9} />
          </mesh>
        ))
      )}
    </group>
  );
}

function Cone({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]}>
        <coneGeometry args={[0.18, 0.5, 16]} />
        <meshStandardMaterial color="#FF6A00" />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.095, 0.115, 0.07, 16]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.42, 0.04, 0.42]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

function SwingRing() {
  const segments = 36;
  const arc = (Math.PI * 2) / segments;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      {Array.from({ length: segments }, (_, i) => (
        <mesh key={i}>
          <ringGeometry args={[SWING_RADIUS_M - 0.18, SWING_RADIUS_M + 0.18, 4, 1, i * arc, arc]} />
          <meshBasicMaterial color={i % 2 ? '#111111' : '#FFCD11'} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function Undercarriage() {
  return (
    <group>
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.65, 0.9, 4.6]} />
          <meshStandardMaterial color="#232323" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[1.8, 0.5, 1.8]} />
        <meshStandardMaterial color="#2e2e2e" />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.12, 24]} />
        <meshStandardMaterial color="#1b1b1b" metalness={0.4} />
      </mesh>
    </group>
  );
}

function Terrain() {
  const patches = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const heading = i * 2.39996;
        const distance = 6 + ((i * 37) % 70);
        return { position: polar(heading, distance, 0.005), radius: 1.5 + ((i * 13) % 5), shade: i % 2 ? '#7b5f40' : '#977a57' };
      }),
    []
  );
  const rocks = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        position: polar(i * 1.7, 9 + ((i * 29) % 45), 0.1),
        scale: 0.15 + ((i * 7) % 5) * 0.08,
      })),
    []
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color={DIRT} roughness={1} />
      </mesh>
      {patches.map((p, i) => (
        <mesh key={i} position={p.position} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[p.radius, 20]} />
          <meshStandardMaterial color={p.shade} roughness={1} />
        </mesh>
      ))}
      {rocks.map((r, i) => (
        <mesh key={i} position={r.position} scale={r.scale}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#6f6558" roughness={1} />
        </mesh>
      ))}
      {/* spoil pile and trench in front of the machine */}
      <mesh position={polar(-0.35, 7.5, 0)} scale={[3, 1.1, 2.4]}>
        <sphereGeometry args={[1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#6e5236" roughness={1} />
      </mesh>
      <mesh position={polar(0, 5.4, 0.01)} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 3.2]} />
        <meshStandardMaterial color="#3f2e1d" roughness={1} />
      </mesh>
      {/* distant hills */}
      {[0.4, 1.3, 2.4, 3.3, 4.4, 5.5].map((h, i) => (
        <mesh key={h} position={polar(h, 170 + i * 15, -6)} scale={[60 + i * 8, 22 + (i % 3) * 6, 40]}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={i % 2 ? '#7d6a52' : '#8e7a60'} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export default function World({ simRef, environment, showSwingRadius }) {
  const world = useRef();
  const rain = environment.weather === 'RAIN';

  useFrame(() => {
    world.current.rotation.y = -simRef.current.machine.swing;
  });

  return (
    <>
      {rain ? (
        <>
          <color attach="background" args={['#59626c']} />
          <fog attach="fog" args={['#59626c', 4, environment.visibility === 'LOW' ? 32 : 70]} />
        </>
      ) : (
        <>
          <Sky sunPosition={[80, 40, -60]} turbidity={7} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />
          <fog attach="fog" args={['#cfd8e0', 70, 280]} />
        </>
      )}
      <hemisphereLight args={[rain ? '#9aa4ae' : '#e4edf5', '#6b5a45', rain ? 0.8 : 1.1]} />
      <directionalLight position={[40, 60, -30]} intensity={rain ? 0.5 : 2.0} />
      <ambientLight intensity={0.2} />

      <group ref={world}>
        <Terrain />
        <Undercarriage />
        <DumpTruck heading={1.05} distance={10} />
        {[0.9, 1.2, 1.5].map((h) => (
          <Cone key={h} position={polar(h, 13)} />
        ))}
        {[-0.9, -1.1, -1.3].map((h) => (
          <Cone key={h} position={polar(h, 11)} />
        ))}
        {showSwingRadius && <SwingRing />}
        <Worker simRef={simRef} />
      </group>

      {rain && <Rain />}
    </>
  );
}
