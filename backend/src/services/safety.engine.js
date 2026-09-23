// Deterministic safety rules (IMPLEMENTATION_PLAN.md §6).
// Never reads telemetry.scenario — detection must work from sensor values alone.

const WORKING_STATES = new Set(['OPERATING', 'LOADING', 'UNLOADING', 'TRANSPORTING']);
const SEATBELT_SUSTAIN_MS = 5000;
const UNATTENDED_SUSTAIN_MS = 30000;
const FATIGUE_MS = 4 * 60 * 60 * 1000;
const BASE_CRITICAL_M = 3;

const SEVERITY = { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM' };

// Dynamic safety envelope: critical = 3 m × condition × load × speed; warning = 2 × critical.
function computeEnvelope(t, site = {}, now = new Date()) {
  const factors = [];
  if (site.weather === 'RAIN') factors.push({ code: 'RAIN', factor: 1.5 });
  if (site.weather === 'FOG' || site.visibility === 'LOW') factors.push({ code: 'LOW_VISIBILITY', factor: 1.5 });
  const hour = now.getHours();
  if (hour >= 19 || hour < 6) factors.push({ code: 'NIGHT', factor: 1.3 });
  if ((t.loadWeightKg || 0) > 0) factors.push({ code: 'LOADED', factor: 1.2 });
  if ((t.speedKph || 0) > 5) factors.push({ code: 'SPEED', factor: 1.3 });

  const multiplier = factors.reduce((m, f) => m * f.factor, 1);
  const criticalM = Number((BASE_CRITICAL_M * multiplier).toFixed(1));
  return { baseM: BASE_CRITICAL_M, criticalM, warnM: Number((criticalM * 2).toFixed(1)), multiplier: Number(multiplier.toFixed(2)), factors };
}

function round(v, digits = 1) {
  return Number(Number(v).toFixed(digits));
}

function createSafetyEngine() {
  // machineId -> { ruleId -> firstSeenMs } for rules that must persist before firing
  const since = new Map();

  function sustained(machineId, ruleId, active, holdMs, nowMs) {
    const m = since.get(machineId) || {};
    since.set(machineId, m);
    if (!active) {
      delete m[ruleId];
      return { fired: false, forMs: 0 };
    }
    if (m[ruleId] === undefined) m[ruleId] = nowMs;
    const forMs = nowMs - m[ruleId];
    return { fired: forMs >= holdMs, forMs };
  }

  // Returns the list of conditions currently true for this machine.
  function evaluate(machineId, t, { site = {}, shift = null, now = new Date() } = {}) {
    const nowMs = now.getTime();
    const out = [];
    const add = (ruleId, severity, reason, evidence, params = evidence) => out.push({ ruleId, severity, reason, evidence, params });
    const working = WORKING_STATES.has(t.state);
    const envelope = computeEnvelope(t, site, now);

    const belt = sustained(machineId, 'SEATBELT_VIOLATION', t.seatbeltStatus === false && working, SEATBELT_SUSTAIN_MS, nowMs);
    if (belt.fired) {
      add('SEATBELT_VIOLATION', SEVERITY.CRITICAL, `Seatbelt open while ${t.state} for ${Math.round(belt.forMs / 1000)} s`, {
        seatbeltStatus: 0,
        forSec: Math.round(belt.forMs / 1000),
      }, { state: t.state, forSec: Math.round(belt.forMs / 1000) });
    }

    const unattended = sustained(machineId, 'UNATTENDED_MACHINE', t.operatorPresent === false && t.engineRpm > 0, UNATTENDED_SUSTAIN_MS, nowMs);
    if (unattended.fired) {
      add('UNATTENDED_MACHINE', SEVERITY.HIGH, `Engine running with no operator in seat for ${Math.round(unattended.forMs / 1000)} s`, {
        engineRpm: t.engineRpm,
        forSec: Math.round(unattended.forMs / 1000),
      });
    }

    if (t.operatorPresent === false && t.hydraulicLockout === false) {
      add('LOCKOUT_NOT_ENGAGED', SEVERITY.HIGH, 'Operator left the seat with hydraulics unlocked', { operatorPresent: 0, hydraulicLockout: 0 });
    }

    const d = t.nearestObjectDistanceM;
    if (typeof d === 'number') {
      if (d < envelope.criticalM) {
        add('PROXIMITY_CRITICAL', SEVERITY.CRITICAL, `Person/object ${round(d)} m away — safe distance is ${envelope.criticalM} m`, {
          distanceM: round(d),
          criticalM: envelope.criticalM,
          warnM: envelope.warnM,
        });
      } else if (d < envelope.warnM) {
        add('PROXIMITY_WARNING', SEVERITY.MEDIUM, `Person/object ${round(d)} m away — warning zone is ${envelope.warnM} m`, {
          distanceM: round(d),
          criticalM: envelope.criticalM,
          warnM: envelope.warnM,
        });
      }
    }

    const loaded = (t.loadWeightKg || 0) > 0;
    const tiltLimit = loaded && (t.boomHeightM || 0) > 2 ? 10 : 15;
    if ((t.tiltAngleDeg || 0) > tiltLimit) {
      add('ROLLOVER_RISK', SEVERITY.CRITICAL, `Tilt ${round(t.tiltAngleDeg)}° exceeds ${tiltLimit}° limit`, {
        tiltAngleDeg: round(t.tiltAngleDeg),
        limitDeg: tiltLimit,
      });
    }

    if (t.ratedCapacityKg && (t.loadWeightKg || 0) > t.ratedCapacityKg) {
      add('OVERLOAD', SEVERITY.HIGH, `Load ${t.loadWeightKg} kg over rated ${t.ratedCapacityKg} kg`, {
        loadWeightKg: t.loadWeightKg,
        ratedCapacityKg: t.ratedCapacityKg,
      });
    }

    if (t.engineTemperature > 105 || t.hydraulicTemperature > 95) {
      add('OVERHEATING', SEVERITY.HIGH, `Engine ${round(t.engineTemperature)} °C / hydraulic ${round(t.hydraulicTemperature)} °C`, {
        engineTemperature: round(t.engineTemperature),
        hydraulicTemperature: round(t.hydraulicTemperature),
      });
    }

    if (typeof t.oilPressureKpa === 'number' && t.oilPressureKpa < 150 && t.engineRpm > 800) {
      add('LOW_OIL_PRESSURE', SEVERITY.HIGH, `Oil pressure ${t.oilPressureKpa} kPa at ${t.engineRpm} rpm`, {
        oilPressureKpa: t.oilPressureKpa,
        engineRpm: t.engineRpm,
      });
    }

    if (t.vibration > 0.8) {
      add('HIGH_VIBRATION', SEVERITY.MEDIUM, `Vibration ${round(t.vibration, 2)} g above 0.8 g`, { vibration: round(t.vibration, 2) });
    }

    if (t.impactG > 2.5) {
      add('IMPACT', SEVERITY.CRITICAL, `Impact of ${round(t.impactG, 2)} g detected`, { impactG: round(t.impactG, 2) });
    }

    if (shift?.activeSince && nowMs - Date.parse(shift.activeSince) > FATIGUE_MS) {
      const hours = round((nowMs - Date.parse(shift.activeSince)) / 3600000);
      add('FATIGUE', SEVERITY.MEDIUM, `${hours} h of continuous operation without a break`, { continuousHours: hours });
    }

    return { conditions: out, envelope };
  }

  return { evaluate };
}

module.exports = { createSafetyEngine, computeEnvelope, SEVERITY, WORKING_STATES };
