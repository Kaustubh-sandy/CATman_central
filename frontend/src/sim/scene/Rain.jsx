import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const AREA = 18;
const HEIGHT = 16;
const DROP_LEN = 0.45;
const FALL_SPEED = 16;

// Keep drops out of the cab footprint so it doesn't rain indoors.
function insideCab(x, z) {
  return x > -1.3 && x < 0.2 && z > -1.1 && z < 1.1;
}

export default function Rain({ count = 1800 }) {
  const lines = useRef();

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      let x;
      let z;
      do {
        x = (Math.random() * 2 - 1) * AREA;
        z = (Math.random() * 2 - 1) * AREA;
      } while (insideCab(x, z));
      const y = Math.random() * HEIGHT;
      arr.set([x, y, z, x - 0.03, y - DROP_LEN, z], i * 6);
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    const attr = lines.current.geometry.attributes.position;
    const arr = attr.array;
    const fall = FALL_SPEED * Math.min(dt, 0.05);
    for (let o = 0; o < arr.length; o += 6) {
      arr[o + 1] -= fall;
      arr[o + 4] -= fall;
      if (arr[o + 4] < 0) {
        arr[o + 1] += HEIGHT;
        arr[o + 4] += HEIGHT;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lines} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#c9d6e3" transparent opacity={0.45} />
    </lineSegments>
  );
}
