import { shareIsLive, pruneShares, formatTimeLeft, shouldPush, SHARE_DURATIONS, SHARE_PUSH_INTERVAL_MS } from '../src/lib/liveShare';
import { buildShareMessage } from '../src/lib/share';

const now = Date.parse('2026-09-30T12:00:00Z');
const inMin = (m) => new Date(now + m * 60000).toISOString();

describe('live share helpers', () => {
  it('offers the four duration chips within server bounds', () => {
    expect(SHARE_DURATIONS.map((d) => d.minutes)).toEqual([15, 60, 240, 1440]);
    SHARE_DURATIONS.forEach((d) => {
      expect(d.minutes).toBeGreaterThanOrEqual(15);
      expect(d.minutes).toBeLessThanOrEqual(1440);
    });
  });

  it('knows when a share is live', () => {
    expect(shareIsLive({ id: 'a', expiresAt: inMin(1) }, now)).toBe(true);
    expect(shareIsLive({ id: 'a', expiresAt: inMin(-1) }, now)).toBe(false);
    expect(shareIsLive({ id: 'a', expiresAt: 'junk' }, now)).toBe(false);
    expect(shareIsLive(null, now)).toBe(false);
  });

  it('prunes expired, token-less and other-account shares', () => {
    const list = [
      { id: 'a', token: 't', expiresAt: inMin(10), userId: 'u1' },
      { id: 'b', token: 't', expiresAt: inMin(-10), userId: 'u1' },
      { id: 'c', expiresAt: inMin(10), userId: 'u1' },
      { id: 'd', token: 't', expiresAt: inMin(10), userId: 'u2' },
    ];
    expect(pruneShares(list, { now, userId: 'u1' }).map((s) => s.id)).toEqual(['a']);
    expect(pruneShares('nope')).toEqual([]);
  });

  it('formats time left', () => {
    expect(formatTimeLeft(inMin(0.5), now)).toBe('< 1 min left');
    expect(formatTimeLeft(inMin(8.2), now)).toBe('8 min left');
    expect(formatTimeLeft(inMin(60), now)).toBe('1 h left');
    expect(formatTimeLeft(inMin(192.5), now)).toBe('3 h 12 min left');
    expect(formatTimeLeft(inMin(-1), now)).toBe('Ended');
  });

  it('throttles pushes to one per interval', () => {
    expect(shouldPush(0, now)).toBe(true);
    expect(shouldPush(now - 5000, now)).toBe(false);
    expect(shouldPush(now - SHARE_PUSH_INTERVAL_MS, now)).toBe(true);
  });
});

describe('buildShareMessage', () => {
  const loc = { lat: 19.0761, lng: 72.8777, accuracy: 12.4 };

  it('uses the live link when available', () => {
    const m = buildShareMessage(loc, { name: 'Priya', liveUrl: 'https://api.resqme.app/t/abc', expiresAt: inMin(60) });
    expect(m.url).toBe('https://api.resqme.app/t/abc');
    expect(m.message).toContain('Priya is sharing a live location');
    expect(m.message).toContain('https://api.resqme.app/t/abc');
    expect(m.message).toMatch(/until \d\d:\d\d/);
    expect(m.message).not.toContain('google');
  });

  it('omits the end time for "until I stop"', () => {
    const m = buildShareMessage(loc, { liveUrl: 'https://x/t/abc', expiresAt: inMin(60), untilStopped: true });
    expect(m.message).not.toMatch(/until/);
    expect(m.message.startsWith("I'm sharing")).toBe(true);
  });

  it('falls back to a static maps link', () => {
    const m = buildShareMessage(loc, { name: 'Priya' });
    expect(m.url).toMatch(/19\.0761/);
    expect(m.message).toContain('~12 m');
  });
});
