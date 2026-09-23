import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';
import { BOOM_PIVOT, LENGTHS } from '../machineModel';

const YELLOW = '#F2B705';
const DARK = '#2a2a2a';

function Part({ args, position, rotation, color = YELLOW, roughness = 0.55, metalness = 0.1 }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

function Bucket() {
  return (
    <group>
      <Part args={[0.9, 0.06, 1.05]} position={[0, -0.12, -0.52]} rotation={[0.25, 0, 0]} color="#caa004" />
      <Part args={[0.05, 0.5, 0.95]} position={[-0.45, 0.05, -0.5]} color="#caa004" />
      <Part args={[0.05, 0.5, 0.95]} position={[0.45, 0.05, -0.5]} color="#caa004" />
      <Part args={[0.9, 0.42, 0.07]} position={[0, 0.12, -0.03]} color="#caa004" />
      {[-0.34, -0.17, 0, 0.17, 0.34].map((x) => (
        <Part key={x} args={[0.07, 0.05, 0.16]} position={[x, -0.26, -1.08]} rotation={[0.25, 0, 0]} color="#555" metalness={0.6} />
      ))}
    </group>
  );
}

function orientCylinder(barrel, rod, from, to, dir, q, up) {
  dir.subVectors(to, from);
  const len = dir.length();
  dir.normalize();
  q.setFromUnitVectors(up, dir);
  barrel.position.copy(from).addScaledVector(dir, len * 0.3);
  barrel.quaternion.copy(q);
  barrel.scale.set(1, len * 0.6, 1);
  rod.position.copy(from).addScaledVector(dir, len * 0.78);
  rod.quaternion.copy(q);
  rod.scale.set(1, len * 0.44, 1);
}

function Cylinder({ barrelRef, rodRef, radius }) {
  return (
    <>
      <mesh ref={barrelRef}>
        <cylinderGeometry args={[radius, radius, 1, 16]} />
        <meshStandardMaterial color={YELLOW} roughness={0.5} />
      </mesh>
      <mesh ref={rodRef}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, 1, 12]} />
        <meshStandardMaterial color="#dcdfe3" metalness={0.9} roughness={0.2} />
      </mesh>
    </>
  );
}

export default function Boom({ simRef }) {
  const boom = useRef();
  const arm = useRef();
  const bucket = useRef();

  const anchors = {
    base: useRef(),
    boomUnder: useRef(),
    boomTop: useRef(),
    armTail: useRef(),
    armTop: useRef(),
    bucketLink: useRef(),
  };
  const cylinders = [
    { from: anchors.base, to: anchors.boomUnder, barrel: useRef(), rod: useRef(), radius: 0.075 },
    { from: anchors.boomTop, to: anchors.armTail, barrel: useRef(), rod: useRef(), radius: 0.065 },
    { from: anchors.armTop, to: anchors.bucketLink, barrel: useRef(), rod: useRef(), radius: 0.055 },
  ];

  const scratch = useMemo(
    () => ({ a: new Vector3(), b: new Vector3(), dir: new Vector3(), q: new Quaternion(), up: new Vector3(0, 1, 0) }),
    []
  );

  useFrame(() => {
    const m = simRef.current.machine;
    boom.current.rotation.x = m.boom;
    arm.current.rotation.x = m.arm;
    bucket.current.rotation.x = m.bucket;

    cylinders.forEach((c) => {
      c.from.current.getWorldPosition(scratch.a);
      c.to.current.getWorldPosition(scratch.b);
      orientCylinder(c.barrel.current, c.rod.current, scratch.a, scratch.b, scratch.dir, scratch.q, scratch.up);
    });
  });

  return (
    <group>
      <group ref={anchors.base} position={[BOOM_PIVOT[0], 1.2, -1.45]} />
      <group position={BOOM_PIVOT}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 16]} />
          <meshStandardMaterial color={DARK} metalness={0.5} />
        </mesh>
        <group ref={boom}>
          <Part args={[0.4, 0.55, 3.0]} position={[0, 0.05, -1.4]} />
          <Part args={[0.36, 0.48, 2.5]} position={[0, 0.02, -3.95]} />
          <group ref={anchors.boomUnder} position={[0, -0.3, -2.2]} />
          <group ref={anchors.boomTop} position={[0, 0.32, -2.5]} />

          <group ref={arm} position={[0, 0, -LENGTHS.boom]}>
            <Part args={[0.3, 0.4, 3.15]} position={[0, 0, -1.2]} />
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.09, 0.09, 0.46, 14]} />
              <meshStandardMaterial color={DARK} metalness={0.5} />
            </mesh>
            <group ref={anchors.armTail} position={[0, 0.3, 0.38]} />
            <group ref={anchors.armTop} position={[0, 0.24, -0.7]} />

            <group ref={bucket} position={[0, 0, -LENGTHS.arm]}>
              <group ref={anchors.bucketLink} position={[0, 0.3, 0.1]} />
              <Bucket />
            </group>
          </group>
        </group>
      </group>
      {cylinders.map((c, i) => (
        <Cylinder key={i} barrelRef={c.barrel} rodRef={c.rod} radius={c.radius} />
      ))}
    </group>
  );
}

export function UpperBody() {
  return (
    <group>
      {/* deck */}
      <Part args={[2.8, 0.25, 4.6]} position={[0.1, 1.08, 0.55]} color="#3b3b3b" roughness={0.9} />
      {/* right-side tool box ahead of the tank */}
      <Part args={[0.6, 0.6, 1.3]} position={[1.1, 1.5, -0.45]} />
      {/* engine hood behind cab */}
      <Part args={[2.7, 0.85, 1.7]} position={[0.1, 1.62, 1.85]} />
      <Part args={[0.2, 0.35, 0.2]} position={[0.7, 2.2, 1.6]} color="#1a1a1a" />
      {/* counterweight */}
      <Part args={[2.8, 1.0, 0.65]} position={[0.1, 1.5, 3.0]} color={DARK} roughness={0.8} />
      {/* handrail on right */}
      <Part args={[0.04, 0.04, 1.4]} position={[1.4, 2.0, -0.45]} color="#111" />
    </group>
  );
}
