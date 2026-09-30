import { colors, severityColor } from '../theme';

export const ACTIVE_STATUSES = ['open', 'acknowledged', 'dispatched'];

export const STATUS_META = {
  open: { label: 'Open', color: colors.red },
  acknowledged: { label: 'Help coming', color: colors.primary },
  dispatched: { label: 'Dispatched', color: colors.primary },
  resolved: { label: 'Resolved', color: colors.green },
  cancelled: { label: 'False alarm', color: colors.muted },
};

export const statusMeta = (s) => STATUS_META[s] || { label: s || 'Unknown', color: colors.muted };
export const severityMeta = (s) => (s ? { label: s, color: severityColor[s] || colors.muted } : null);

const pad = (n) => String(n).padStart(2, '0');

export function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDay(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function formatRelative(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : formatDay(iso);
}

// Duration between two ISO timestamps as "4 min" / "1 h 12 min".
export function formatDuration(fromIso, toIso) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
