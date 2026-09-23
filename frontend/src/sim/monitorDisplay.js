import { SWING_RADIUS_M } from './machineModel';

export const MONITOR_W = 512;
export const MONITOR_H = 320;

const COLORS = { ok: '#2E9E44', warn: '#F2A900', danger: '#D62828', text: '#FFFFFF', dim: '#8A9099', bg: '#0A0D10' };
const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

function toneForTemp(v, warnAt, dangerAt) {
  if (v > dangerAt) return 'danger';
  if (v > warnAt) return 'warn';
  return 'ok';
}

function drawBar(ctx, y, label, value, max, unit, tone) {
  ctx.fillStyle = COLORS.dim;
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(label, 16, y + 14);

  const x = 100;
  const w = 150;
  ctx.strokeStyle = '#3A3A3A';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, 26);
  ctx.fillStyle = COLORS[tone];
  ctx.fillRect(x + 3, y + 3, Math.max(0, Math.min(1, value / max)) * (w - 6), 20);

  ctx.fillStyle = COLORS.text;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(`${Math.round(value)}${unit}`, x + w + 12, y + 14);
}

function drawTile(ctx, x, y, w, label, tone) {
  ctx.fillStyle = `${COLORS[tone]}33`;
  ctx.fillRect(x, y, w, 44);
  ctx.strokeStyle = COLORS[tone];
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 41);
  ctx.fillStyle = COLORS[tone];
  ctx.font = `700 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 23);
  ctx.textAlign = 'left';
}

export function drawMonitor(ctx, m, t) {
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);

  const hot = m.engineTemp > 100;
  const flash = Math.sin(t * 9) > 0;

  // Header
  ctx.fillStyle = hot && flash ? COLORS.danger : '#FFCD11';
  ctx.fillRect(0, 0, MONITOR_W, 40);
  ctx.fillStyle = hot && flash ? COLORS.text : '#121212';
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(hot ? 'ENGINE HOT' : m.engineOn ? 'ENGINE RUNNING' : 'ENGINE OFF', 14, 21);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(m.rpm)} RPM`, MONITOR_W - 14, 21);
  ctx.textAlign = 'left';

  // Gauges
  drawBar(ctx, 58, 'FUEL', m.fuelPct, 100, '%', m.fuelPct < 15 ? 'danger' : m.fuelPct < 30 ? 'warn' : 'ok');
  drawBar(ctx, 104, 'ENGINE', m.engineTemp, 120, '°', toneForTemp(m.engineTemp, 95, 105));
  drawBar(ctx, 150, 'HYDR', m.hydTemp, 110, '°', toneForTemp(m.hydTemp, 88, 95));

  // Proximity panel
  const px = 330;
  const d = m.nearestPersonM;
  let proxTone = 'ok';
  let proxLine1 = 'AREA';
  let proxLine2 = 'CLEAR';
  if (d !== null && d < SWING_RADIUS_M) {
    proxTone = 'danger';
    proxLine1 = 'STOP';
    proxLine2 = `PERSON ${d.toFixed(1)} m`;
  } else if (d !== null && d < SWING_RADIUS_M * 1.6) {
    proxTone = 'warn';
    proxLine1 = 'PERSON';
    proxLine2 = `${d.toFixed(1)} m`;
  }
  const proxFill = proxTone === 'danger' && flash ? COLORS.danger : `${COLORS[proxTone]}33`;
  ctx.fillStyle = proxFill;
  ctx.fillRect(px, 56, 168, 122);
  ctx.strokeStyle = COLORS[proxTone];
  ctx.lineWidth = 4;
  ctx.strokeRect(px + 2, 58, 164, 118);
  ctx.fillStyle = proxTone === 'danger' && flash ? COLORS.text : COLORS[proxTone];
  ctx.textAlign = 'center';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(proxLine1, px + 84, 98);
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(proxLine2, px + 84, 138);
  ctx.textAlign = 'left';

  // Status tiles
  const horn = performance.now() < m.hornUntil;
  drawTile(ctx, 16, 204, 112, m.seatbelt ? 'BELT OK' : 'BELT', m.seatbelt ? 'ok' : 'danger');
  drawTile(ctx, 136, 204, 120, m.locked ? 'HYD LOCK' : 'HYD ON', m.locked ? 'warn' : 'ok');
  drawTile(ctx, 264, 204, 112, m.throttleHigh ? 'THR HIGH' : 'THR IDLE', 'ok');
  drawTile(ctx, 384, 204, 112, 'HORN', horn ? 'warn' : 'ok');

  // Footer
  ctx.fillStyle = COLORS.dim;
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(`SWING ${Math.round((m.swing * 180) / Math.PI)}°`, 16, 285);
  ctx.textAlign = 'right';
  ctx.fillText('TRAINING SIM', MONITOR_W - 16, 285);
  ctx.textAlign = 'left';
}
