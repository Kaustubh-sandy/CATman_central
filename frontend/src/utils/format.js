export function formatRelativeTime(isoString, t) {
  if (!isoString) return t('time.never');

  const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 1000));
  if (diffSec < 5) return t('time.justNow');
  if (diffSec < 60) return t('time.secondsAgo', { n: diffSec });

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });

  return t('time.hoursAgo', { n: Math.round(diffMin / 60) });
}

export function formatClock(isoString) {
  return isoString ? new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

export function toneForFuel(pct) {
  if (pct === null || pct === undefined) return 'ok';
  if (pct < 15) return 'danger';
  if (pct < 30) return 'warn';
  return 'ok';
}

export function toneForEngineTemp(value) {
  if (!Number.isFinite(value)) return 'ok';
  if (value > 105) return 'danger';
  if (value > 95) return 'warn';
  return 'ok';
}

export function toneForHydraulicTemp(value) {
  if (!Number.isFinite(value)) return 'ok';
  if (value > 95) return 'danger';
  if (value > 90) return 'warn';
  return 'ok';
}
