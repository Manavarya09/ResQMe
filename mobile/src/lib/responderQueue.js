// Pure helpers for the responder incident queue (unit tested).
export const ACTIVE = ['open', 'acknowledged', 'dispatched'];
export const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

const time = (iso) => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};
const sevRank = (inc) => SEVERITY_RANK[inc?.severity || inc?.triage?.severity] || 0;
export const isActive = (inc) => ACTIVE.includes(inc?.status);

// Queue order: active before closed; active by severity (critical first) then newest first;
// closed incidents by most recently updated.
export function compareIncidents(a, b) {
  const aa = isActive(a);
  const ba = isActive(b);
  if (aa !== ba) return aa ? -1 : 1;
  if (aa) {
    const s = sevRank(b) - sevRank(a);
    if (s) return s;
    return time(b.createdAt) - time(a.createdAt);
  }
  return time(b.updatedAt || b.createdAt) - time(a.updatedAt || a.createdAt);
}

export const sortIncidents = (list) => [...(list || [])].filter(Boolean).sort(compareIncidents);

// Insert or replace by id (keeps fields the socket payload does not carry, e.g. events).
export function upsertIncident(list, inc) {
  if (!inc?.id) return list || [];
  const cur = list || [];
  const i = cur.findIndex((x) => x.id === inc.id);
  if (i === -1) return sortIncidents([inc, ...cur]);
  const next = [...cur];
  next[i] = { ...cur[i], ...inc };
  return sortIncidents(next);
}

export function splitQueue(list) {
  const sorted = sortIncidents(list);
  return { active: sorted.filter(isActive), closed: sorted.filter((i) => !isActive(i)) };
}

export function severityCounts(list) {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  (list || []).forEach((i) => {
    if (!isActive(i)) return;
    const s = i.severity || i.triage?.severity;
    if (s in out) out[s] += 1;
  });
  return out;
}

// Short "time ago" suited to a live queue: "now", "45 s", "12 min", "3 h", "2 d".
export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export const telLink = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const ETA_CHOICES = [5, 10, 15, 20];
