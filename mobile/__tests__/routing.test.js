import {
  geojsonToCoords, parseOsrmResponse, fetchWalkingRoute, straightRoute, buildRouteUrl, toOsrmCoords,
  clearRouteCache, createRouteFetcher, WALK_SPEED_MPS, PROVIDERS,
} from '../src/lib/routing';
import { pathLengthM } from '../src/lib/geo';

const A = { lat: 28.6139, lng: 77.209 };
const B = { lat: 28.62, lng: 77.22 };
const C = { lat: 28.625, lng: 77.215 };

const osrmBody = (overrides = {}) => ({
  code: 'Ok',
  routes: [{
    distance: 1771.7,
    duration: 1417.3,
    geometry: { type: 'LineString', coordinates: [[77.209, 28.6139], [77.212, 28.615], [77.22, 28.62]] },
    ...overrides,
  }],
});
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => clearRouteCache());

describe('geojsonToCoords', () => {
  test('converts [lng, lat] pairs to {lat, lng}', () => {
    expect(geojsonToCoords({ type: 'LineString', coordinates: [[77.2, 28.6], [77.3, 28.7]] }))
      .toEqual([{ lat: 28.6, lng: 77.2 }, { lat: 28.7, lng: 77.3 }]);
  });

  test('accepts a bare coordinates array and drops malformed points', () => {
    expect(geojsonToCoords([[77.2, 28.6], [null, 1], [200, 10], ['x', 'y'], [1], [77.3, 28.7, 12]]))
      .toEqual([{ lat: 28.6, lng: 77.2 }, { lat: 28.7, lng: 77.3 }]);
  });

  test('returns [] for missing geometry', () => {
    expect(geojsonToCoords(undefined)).toEqual([]);
    expect(geojsonToCoords({})).toEqual([]);
  });
});

describe('parseOsrmResponse', () => {
  test('uses OSRM distance and duration for a foot profile', () => {
    const r = parseOsrmResponse(osrmBody());
    expect(r.coords).toHaveLength(3);
    expect(r.distanceM).toBe(1771.7);
    expect(r.durationS).toBe(1417.3);
  });

  test('derives walking ETA from distance when the provider duration is not a walking one', () => {
    const r = parseOsrmResponse(osrmBody({ duration: 200 }), { walkingDuration: false });
    expect(r.durationS).toBeCloseTo(1771.7 / WALK_SPEED_MPS, 5);
  });

  test('rejects error responses and degenerate geometry', () => {
    expect(parseOsrmResponse({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseOsrmResponse(osrmBody({ geometry: { coordinates: [[77.2, 28.6]] } }))).toBeNull();
    expect(parseOsrmResponse(null)).toBeNull();
  });
});

describe('URL building', () => {
  test('OSRM wants lng,lat pairs joined with ;', () => {
    expect(toOsrmCoords([A, B])).toBe('77.209000,28.613900;77.220000,28.620000');
    expect(buildRouteUrl([A, B])).toBe(
      'https://router.project-osrm.org/route/v1/foot/77.209000,28.613900;77.220000,28.620000?overview=full&geometries=geojson'
    );
  });
});

describe('fetchWalkingRoute', () => {
  test('returns the routed path from the first provider', async () => {
    const fetchImpl = jest.fn(() => ok(osrmBody()));
    const r = await fetchWalkingRoute([A, B], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain(PROVIDERS[0].base);
    expect(r.source).toBe(PROVIDERS[0].id);
    expect(r.coords[1]).toEqual({ lat: 28.615, lng: 77.212 });
    expect(r.durationS).toBe(1417.3);
  });

  test('falls through to the next provider when the first fails', async () => {
    const fetchImpl = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('offline')))
      .mockImplementationOnce(() => ok(osrmBody({ duration: 100 })));
    const r = await fetchWalkingRoute([A, B], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('osrm-demo');
    expect(r.durationS).toBeCloseTo(1771.7 / WALK_SPEED_MPS, 5); // car duration ignored
  });

  test('falls back to straight lines when every request fails', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));
    const r = await fetchWalkingRoute([A, B, C], { fetchImpl });
    expect(r.source).toBe('straight');
    expect(r.coords).toEqual([A, B, C]);
    expect(r.distanceM).toBeCloseTo(pathLengthM([A, B, C]), 5);
    expect(r.durationS).toBeCloseTo(r.distanceM / WALK_SPEED_MPS, 5);
  });

  test('falls back to straight lines on timeout', async () => {
    const fetchImpl = jest.fn(() => new Promise(() => {})); // never resolves
    const r = await fetchWalkingRoute([A, B], { fetchImpl, timeoutMs: 50 });
    expect(r.source).toBe('straight');
  });

  test('falls back when fetch is unavailable', async () => {
    const r = await fetchWalkingRoute([A, B], { fetchImpl: null });
    expect(r.source).toBe('straight');
  });

  test('fewer than two points is a trivial straight route with no request', async () => {
    const fetchImpl = jest.fn();
    const r = await fetchWalkingRoute([A], { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r).toEqual(straightRoute([A]));
    expect(r.distanceM).toBe(0);
  });

  test('successful routes are cached, fallbacks are not', async () => {
    const fetchImpl = jest.fn(() => ok(osrmBody()));
    await fetchWalkingRoute([A, B], { fetchImpl });
    await fetchWalkingRoute([{ ...A }, { ...B }], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const failing = jest.fn(() => Promise.reject(new Error('down')));
    await fetchWalkingRoute([A, C], { fetchImpl: failing });
    await fetchWalkingRoute([A, C], { fetchImpl: failing });
    expect(failing).toHaveBeenCalledTimes(2 * PROVIDERS.length);
  });
});

describe('createRouteFetcher (debounce)', () => {
  test('only the latest request within the debounce window hits the network and reports', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(() => ok(osrmBody()));
      const onResult = jest.fn();
      const f = createRouteFetcher({ debounceMs: 300, fetchImpl });
      f.request([A, B], onResult);
      f.request([A, C], onResult);
      f.request([A, B, C], onResult);
      await jest.advanceTimersByTimeAsync(350);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][0]).toContain(toOsrmCoords([A, B, C]));
      expect(onResult).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('cancel drops a pending request', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(() => ok(osrmBody()));
      const onResult = jest.fn();
      const f = createRouteFetcher({ debounceMs: 300, fetchImpl });
      f.request([A, B], onResult);
      f.cancel();
      await jest.advanceTimersByTimeAsync(500);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(onResult).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('geo helpers used with routed paths', () => {
  const { remainingPathM, formatDuration, haversineM } = require('../src/lib/geo');
  test('remaining distance along a path from its midpoint', () => {
    const path = [A, { lat: A.lat + 0.01, lng: A.lng }, { lat: A.lat + 0.02, lng: A.lng }];
    const mid = { lat: A.lat + 0.005, lng: A.lng };
    const expected = haversineM(mid, path[2]);
    expect(remainingPathM(mid, path)).toBeCloseTo(expected, -1);
    expect(remainingPathM(path[2], path)).toBeLessThan(1);
  });
  test('formatDuration', () => {
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(1417)).toBe('24 min');
    expect(formatDuration(3600 + 25 * 60)).toBe('1 h 25 min');
    expect(formatDuration(NaN)).toBe('—');
  });
});
