import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

// Pointer moves further than this between down and up = a camera drag, not a click.
const DRAG_TOLERANCE_PX = 6;

export default function Interactive({
  id,
  label,
  onActivate,
  hinted = false,
  haloPosition = [0, 0, 0],
  haloRadius = 0.06,
  labelOffset = 0.08,
  children,
}) {
  const [hovered, setHovered] = useState(false);
  const halo = useRef();

  useFrame(({ clock }) => {
    if (!halo.current) return;
    const pulse = Math.sin(clock.elapsedTime * 6);
    halo.current.scale.setScalar(1 + 0.18 * pulse);
    halo.current.material.opacity = 0.3 + 0.15 * pulse;
  });

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > DRAG_TOLERANCE_PX) return;
        onActivate(id);
      }}
    >
      {children}
      {hinted && (
        <mesh ref={halo} position={haloPosition}>
          <sphereGeometry args={[haloRadius, 20, 16]} />
          <meshBasicMaterial color="#FFCD11" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {(hovered || hinted) && (
        <Html
          position={[haloPosition[0], haloPosition[1] + haloRadius + labelOffset, haloPosition[2]]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`whitespace-nowrap rounded border-2 px-2 py-0.5 font-condensed text-base font-bold uppercase tracking-wide ${
              hinted ? 'border-ink bg-catYellow text-ink' : 'border-white/40 bg-black/80 text-white'
            }`}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}
