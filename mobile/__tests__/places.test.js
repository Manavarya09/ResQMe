import { parseOverpass, fetchNearbyHelp, clearPlacesCache, buildOverpassQuery, directionsUrl, telUrl, OVERPASS_ENDPOINTS } from '../src/lib/places';

const here = { lat: 28.6139, lng: 77.209 };
const body = {
  elements: [
    { type: 'node', id: 1, lat: 28.63, lon: 77.22, tags: { amenity: 'police', name: 'Far Police', phone: '+91 11 2345 6789; 100' } },
    { type: 'way', id: 2, center: { lat: 28.615, lon: 77.21 }, tags: { amenity: 'hospital', name: 'Near Hospital' } },
    { type: 'node', id: 3, lat: 28.62, lon: 77.21, tags: { amenity: 'pharmacy', name: 'Ignored' } },
    { type: 'node', id: 4, tags: { amenity: 'hospital' } }, // no coordinates
  ],
};
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });

beforeEach(() => clearPlacesCache());

test('parseOverpass keeps hospitals/police, uses way centers, sorts by distance, extracts phone', () => {
  const places = parseOverpass(body, here);
  expect(places.map((p) => p.name)).toEqual(['Near Hospital', 'Far Police']);
  expect(places[0]).toMatchObject({ kind: 'hospital', lat: 28.615, lng: 77.21, phone: null });
  expect(places[1].phone).toBe('+91 11 2345 6789');
  expect(places[0].distanceM).toBeLessThan(places[1].distanceM);
});

test('query targets hospitals and police within the radius', () => {
  const q = buildOverpassQuery(here, 3000);
  expect(q).toContain('hospital|police');
  expect(q).toContain('around:3000,28.613900,77.209000');
});

test('fetchNearbyHelp caches results and falls back to mirrors', async () => {
  const fetchImpl = jest.fn()
    .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }))
    .mockImplementation(() => ok(body));
  const a = await fetchNearbyHelp(here, { fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[1][0]).toBe(OVERPASS_ENDPOINTS[1]);
  expect(a).toHaveLength(2);
  await fetchNearbyHelp({ lat: here.lat + 0.001, lng: here.lng }, { fetchImpl }); // ~110 m away: cached
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('fetchNearbyHelp rejects when every endpoint fails and nothing is cached', async () => {
  const fetchImpl = jest.fn(() => Promise.reject(new Error('offline')));
  await expect(fetchNearbyHelp(here, { fetchImpl })).rejects.toThrow('offline');
});

test('link helpers', () => {
  expect(directionsUrl({ lat: 1, lng: 2 })).toBe('https://www.google.com/maps/dir/?api=1&destination=1.000000,2.000000&travelmode=walking');
  expect(telUrl('+91 (11) 2345-6789')).toBe('tel:+911123456789');
});

test('hedges: a slow main instance is overtaken by a mirror', async () => {
  const fetchImpl = jest.fn((url) =>
    url === OVERPASS_ENDPOINTS[0]
      ? new Promise(() => {}) // hangs
      : ok({ elements: [{ type: 'node', id: 9, lat: 28.614, lon: 77.209, tags: { amenity: 'police', name: 'Mirror Police' } }] })
  );
  const places = await fetchNearbyHelp(here, { fetchImpl, staggerMs: 20, timeoutMs: 2000 });
  expect(places[0].name).toBe('Mirror Police');
  expect(fetchImpl.mock.calls[1][0]).toBe(OVERPASS_ENDPOINTS[1]);
});

test('times out when nothing answers', async () => {
  const fetchImpl = jest.fn(() => new Promise(() => {}));
  await expect(fetchNearbyHelp(here, { fetchImpl, staggerMs: 10, timeoutMs: 80, totalTimeoutMs: 120 })).rejects.toThrow(/timed out/);
});
