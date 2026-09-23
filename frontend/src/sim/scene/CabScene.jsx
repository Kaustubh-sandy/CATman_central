import { OrbitControls } from '@react-three/drei';
import Cab from './Cab';
import Boom, { UpperBody } from './Boom';
import World from './World';
import MachineController from './MachineController';
import CameraGuide from './CameraGuide';
import { EYE } from '../machineModel';

// Target sits a hair in front of the eye so orbiting acts as "look around from the seat".
const LOOK_TARGET = [EYE[0], EYE[1] - 0.0025, EYE[2] - 0.01];

export default function CabScene({ simRef, module, hinted, showSwingRadius, running, onControl, onAction, onViolation, onNotice }) {
  return (
    <>
      <OrbitControls
        makeDefault
        target={LOOK_TARGET}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={-0.35}
        minPolarAngle={0.55}
        maxPolarAngle={2.85}
      />
      <CameraGuide hinted={hinted} />
      <World simRef={simRef} environment={module.environment} showSwingRadius={showSwingRadius} />
      <UpperBody />
      <Boom simRef={simRef} />
      <Cab simRef={simRef} hinted={hinted} onControl={onControl} />
      <MachineController simRef={simRef} running={running} onAction={onAction} onViolation={onViolation} onNotice={onNotice} />
    </>
  );
}
