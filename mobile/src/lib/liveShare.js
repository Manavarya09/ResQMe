// Pure helpers for live location sharing links (no React / native imports, unit tested).

export const SHARE_PUSH_INTERVAL_MS = 15000;
export const EMERGENCY_SHARE_MINUTES = 240;
export const MAX_SHARE_MINUTES = 1440;

// Duration chips on the Safety Tools screen. "Until I stop" is capped server-side at 24 h.
export const SHARE_DURATIONS = [
  { key: '15m', minutes: 15, label: '15 min' },
  { key: '1h', minutes: 60, label: '1 h' },
  { key: '4h', minutes: 240, label: '4 h' },
  { key: 'stop', minutes: MAX_SHARE_MINUTES, label: 'Until I stop', untilStopped: true },
];

export function shareIsLive(share, now = Date.now()) {
  if (!share?.id || !share?.expiresAt) return false;
  const t = new Date(share.expiresAt).getTime();
  return Number.isFinite(t) && t > now;
}

// Drop expired shares; keep only well-formed ones owned by `userId` (when given).
export function pruneShares(list, { now = Date.now(), userId } = {}) {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => shareIsLive(s, now) && s.token && (!userId || !s.userId || s.userId === userId));
}

// "3 h 12 min left" / "8 min left" / "< 1 min left" / "Ended".
export function formatTimeLeft(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'Ended';
  const m = Math.floor(ms / 60000);
  if (m < 1) return '< 1 min left';
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min left` : `${h} h left`;
}

// Throttle gate shared by every caller that pushes a location to active shares.
export function shouldPush(lastPushAt, now = Date.now(), intervalMs = SHARE_PUSH_INTERVAL_MS) {
  return !lastPushAt || now - lastPushAt >= intervalMs - 250;
}

const pad = (n) => String(n).padStart(2, '0');
export function formatUntil(expiresAt) {
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
