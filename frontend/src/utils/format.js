export function formatRelativeTime(isoString) {
  if (!isoString) return 'never';

  const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 1000));

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.round(diffMin / 60);
  return `${diffHour}h ago`;
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
  if (value > 88) return 'warn';
  return 'ok';
}
