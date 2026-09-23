import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import Interactive from './Interactive';
import { EYE } from '../machineModel';
import { drawMonitor, MONITOR_H, MONITOR_W } from '../monitorDisplay';

const MONITOR_POS = [-0.12, 2.02, -0.72];
const REDRAW_SEC = 0.1;

export default function Monitor({ simRef, hinted, onControl }) {
  const group = useRef();
  const sinceDraw = useRef(REDRAW_SEC);

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = MONITOR_W;
    c.height = MONITOR_H;
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return { canvas: c, texture: tex };
  }, []);

  useLayoutEffect(() => {
    group.current.lookAt(EYE[0], EYE[1], EYE[2]);
  }, []);

  useFrame((state, dt) => {
    sinceDraw.current += dt;
    if (sinceDraw.current < REDRAW_SEC) return;
    sinceDraw.current = 0;
    drawMonitor(canvas.getContext('2d'), simRef.current.machine, state.clock.elapsedTime);
    texture.needsUpdate = true;
  });

  return (
    <group ref={group} position={MONITOR_POS}>
      <Interactive id="monitor" label="Monitor" onActivate={onControl} hinted={hinted === 'monitor'} haloRadius={0.17}>
        <mesh position={[0, 0, -0.022]}>
          <boxGeometry args={[0.3, 0.205, 0.04]} />
          <meshStandardMaterial color="#111214" roughness={0.6} />
        </mesh>
        <mesh>
          <planeGeometry args={[0.272, 0.17]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </Interactive>
      <mesh position={[0, -0.14, -0.05]}>
        <cylinderGeometry args={[0.012, 0.012, 0.12, 10]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}
