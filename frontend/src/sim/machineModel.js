// Machine frame: swing centre at the origin, ground at y = 0, forward is -Z.
// The cab and boom stay fixed; swinging rotates the world around them instead.

export const EYE = [-0.55, 2.22, 0.36];
export const BOOM_PIVOT = [0.35, 1.45, -0.85];
export const LENGTHS = { boom: 5.2, arm: 2.8, bucket: 1.1 };
export const LIMITS = { boom: [-0.3, 1.05], arm: [-2.5, -0.55], bucket: [-2.3, 0.5] };
export const SWING_RADIUS_M = 8.5;
export const IDLE_RPM = 900;
export const HIGH_RPM = 1850;

const RATES = { boom: 0.42, arm: 0.6, bucket: 0.9, swing: 0.5 };
const GROUND_CONTACT_M = 0.35;

const DEFAULTS = {
  engineOn: false,
  seatbelt: false,
  locked: true,
  throttleHigh: false,
  rpm: 0,
  engineTemp: 72,
  hydTemp: 55,
  fuelPct: 78,
  boom: 0.45,
  arm: -1.9,
  bucket: -0.9,
  swing: 0,
  tempMode: 'NORMAL',
  hornUntil: 0,
  nearestPersonM: null,
};

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function approach(current, target, step) {
  if (current < target) return Math.min(current + step, target);
  if (current > target) return Math.max(current - step, target);
  return current;
}

export function bucketTipHeight(m) {
  const b = m.boom;
  const a = b + m.arm;
  const k = a + m.bucket;
  return BOOM_PIVOT[1] + LENGTHS.boom * Math.sin(b) + LENGTHS.arm * Math.sin(a) + LENGTHS.bucket * Math.sin(k);
}

export function createMachineState(initial = {}) {
  const m = { ...DEFAULTS, ...initial };
  if (initial.rpm === undefined) m.rpm = m.engineOn ? (m.throttleHigh ? HIGH_RPM : IDLE_RPM) : 0;
  m.onGround = bucketTipHeight(m) < GROUND_CONTACT_M;
  return m;
}

// Stick axes: y = forward (+1) / back (-1), x = right (+1) / left (-1). ISO pattern:
// left stick  -> forward/back = arm out/in, left/right = swing left/right
// right stick -> forward/back = boom down/up, left/right = bucket curl/dump
export function stepMachine(m, left, right, dt) {
  const targetRpm = m.engineOn ? (m.throttleHigh ? HIGH_RPM : IDLE_RPM) : 0;
  m.rpm = approach(m.rpm, targetRpm, 1400 * dt);

  let tempTarget = 40;
  if (m.engineOn) {
    if (m.tempMode === 'RISE') tempTarget = 112;
    else if (m.tempMode === 'COOL') tempTarget = 84;
    else tempTarget = m.throttleHigh ? 88 : 82;
  }
  const tempRate = m.tempMode === 'RISE' ? 1.7 : m.tempMode === 'COOL' ? 2.5 : 0.4;
  m.engineTemp = approach(m.engineTemp, tempTarget, tempRate * dt);
  m.hydTemp = approach(m.hydTemp, m.engineOn ? (m.locked ? 58 : 68) : 40, 0.3 * dt);

  if (m.engineOn) m.fuelPct = Math.max(0, m.fuelPct - dt * (m.throttleHigh ? 0.01 : 0.004));

  const deltas = { boom: 0, arm: 0, bucket: 0, swing: 0 };
  const active = m.engineOn && !m.locked;
  const wantsMove = left.x !== 0 || left.y !== 0 || right.x !== 0 || right.y !== 0;
  if (!active || !wantsMove) return { deltas, active, wantsMove };

  const f = clamp(m.rpm / HIGH_RPM, 0.45, 1);
  const prev = { boom: m.boom, arm: m.arm, bucket: m.bucket };

  m.boom = clamp(m.boom - right.y * RATES.boom * f * dt, ...LIMITS.boom);
  m.arm = clamp(m.arm + left.y * RATES.arm * f * dt, ...LIMITS.arm);
  m.bucket = clamp(m.bucket + right.x * RATES.bucket * f * dt, ...LIMITS.bucket);

  // Bucket can't dig below the ground surface.
  if (bucketTipHeight(m) < 0.02) {
    m.boom = prev.boom;
    m.arm = prev.arm;
    m.bucket = prev.bucket;
  }

  deltas.swing = -left.x * RATES.swing * f * dt;
  m.swing += deltas.swing;
  deltas.boom = m.boom - prev.boom;
  deltas.arm = m.arm - prev.arm;
  deltas.bucket = m.bucket - prev.bucket;

  return { deltas, active, wantsMove };
}

export function updateGroundContact(m) {
  const onGround = bucketTipHeight(m) < GROUND_CONTACT_M;
  const justLanded = onGround && !m.onGround;
  m.onGround = onGround;
  return justLanded;
}
