import { sortIncidents, upsertIncident, splitQueue, severityCounts, timeAgo, telLink, compareIncidents } from '../src/lib/responderQueue';

const inc = (id, severity, status, createdAt, extra = {}) => ({ id, severity, status, createdAt, updatedAt: createdAt, ...extra });

describe('sortIncidents', () => {
  it('puts active before closed, then severity (critical first), then newest first', () => {
    const list = [
      inc('a', 'low', 'open', '2026-09-30T10:05:00Z'),
      inc('b', 'critical', 'acknowledged', '2026-09-30T10:00:00Z'),
      inc('c', 'critical', 'open', '2026-09-30T10:03:00Z'),
      inc('d', 'critical', 'resolved', '2026-09-30T10:10:00Z'),
      inc('e', 'high', 'dispatched', '2026-09-30T09:00:00Z'),
      inc('f', 'medium', 'cancelled', '2026-09-30T08:00:00Z', { updatedAt: '2026-09-30T11:00:00Z' }),
    ];
    expect(sortIncidents(list).map((i) => i.id)).toEqual(['c', 'b', 'e', 'a', 'f', 'd']);
  });

  it('falls back to triage severity and tolerates junk', () => {
    const list = [inc('x', undefined, 'open', '2026-09-30T10:00:00Z', { triage: { severity: 'high' } }), inc('y', 'medium', 'open', 'bad-date'), null];
    expect(sortIncidents(list).map((i) => i.id)).toEqual(['x', 'y']);
    expect(sortIncidents(undefined)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const list = [inc('a', 'low', 'open', '2026-09-30T10:00:00Z'), inc('b', 'critical', 'open', '2026-09-30T10:00:00Z')];
    sortIncidents(list);
    expect(list.map((i) => i.id)).toEqual(['a', 'b']);
    expect(compareIncidents(list[1], list[0])).toBeLessThan(0);
  });
});

describe('upsertIncident', () => {
  it('adds new incidents in sorted position', () => {
    const list = [inc('a', 'low', 'open', '2026-09-30T10:00:00Z')];
    const next = upsertIncident(list, inc('b', 'critical', 'open', '2026-09-30T09:00:00Z'));
    expect(next.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('merges updates by id and re-sorts (resolved drops below active)', () => {
    const list = [inc('a', 'critical', 'open', '2026-09-30T10:00:00Z', { note: 'keep' }), inc('b', 'low', 'open', '2026-09-30T10:00:00Z')];
    const next = upsertIncident(list, { id: 'a', status: 'resolved', updatedAt: '2026-09-30T10:30:00Z' });
    expect(next.map((i) => i.id)).toEqual(['b', 'a']);
    expect(next[1]).toMatchObject({ status: 'resolved', note: 'keep', severity: 'critical' });
    expect(upsertIncident(list, null)).toBe(list);
  });
});

describe('splitQueue / severityCounts', () => {
  const list = [
    inc('a', 'critical', 'open', '2026-09-30T10:00:00Z'),
    inc('b', 'critical', 'resolved', '2026-09-30T10:00:00Z'),
    inc('c', 'medium', 'dispatched', '2026-09-30T10:00:00Z'),
  ];
  it('splits active and closed', () => {
    const { active, closed } = splitQueue(list);
    expect(active.map((i) => i.id)).toEqual(['a', 'c']);
    expect(closed.map((i) => i.id)).toEqual(['b']);
  });
  it('counts only active incidents', () => {
    expect(severityCounts(list)).toEqual({ critical: 1, high: 0, medium: 1, low: 0 });
  });
});

describe('timeAgo / telLink', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  it('formats compact relative times', () => {
    expect(timeAgo('2026-09-30T11:59:55Z', now)).toBe('now');
    expect(timeAgo('2026-09-30T11:59:15Z', now)).toBe('45 s ago');
    expect(timeAgo('2026-09-30T11:48:00Z', now)).toBe('12 min ago');
    expect(timeAgo('2026-09-30T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-09-28T12:00:00Z', now)).toBe('2 d ago');
    expect(timeAgo('nope', now)).toBe('');
  });
  it('builds dialable tel: links', () => {
    expect(telLink('+91 98000-11111')).toBe('tel:+919800011111');
    expect(telLink(null)).toBe('tel:');
  });
});
