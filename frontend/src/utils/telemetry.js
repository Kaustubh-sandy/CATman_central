// Mirrors backend/src/controllers/machine.controller.js FUEL_TANK_CAPACITY_L.
// Display-only assumption: there is no real tank-capacity sensor field yet.
const FUEL_TANK_CAPACITY_L = 400;

export function deriveFuelPercent(telemetry) {
  if (!telemetry) return null;
  const pct = (telemetry.fuelLevelLitres / FUEL_TANK_CAPACITY_L) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
