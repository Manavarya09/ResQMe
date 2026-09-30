// Walking routes for "Walk with me" via OSRM, with a straight-line fallback.
//
// Providers are tried in order within one overall timeout:
//   1. FOSSGIS OSRM (routing.openstreetmap.de) — a real *foot* profile, so duration is a walking ETA.
//   2. OSRM public demo (router.project-osrm.org/route/v1/foot/...) — the demo server only has a
//      car graph whatever profile is requested, so we keep its geometry/distance but derive the
//      ETA from distance at walking pace.
// If both fail (offline, timeout, bad response) the route is the straight segments between points.
import { pathLengthM } from './geo';

// Wrap fetch: calling a detached window.fetch reference throws "Illegal invocation" in browsers.
const defaultFetch = typeof fetch === 'function' ? (...args) => fetch(...args) : null;

export const WALK_SPEED_MPS = 1.35; // ~4.9 km/h
export const ROUTE_TIMEOUT_MS = 6000;

export const PROVIDERS = [
  { id: 'osrm-fossgis-foot', base: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/', walkingDuration: true },
  { id: 'osrm-demo', base: 'https://router.project-osrm.org/route/v1/foot/', walkingDuration: false },
];

// "lng,lat;lng,lat;..." with 6-decimal precision (~10 cm).
export function toOsrmCoords(points) {
  return points.map((p) => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
}

export function buildRouteUrl(points, base = PROVIDERS[1].base) {
  return `${base}${toOsrmCoords(points)}?overview=full&geometries=geojson`;
}

// GeoJSON LineString ([[lng, lat], ...]) -> [{ lat, lng }]. Accepts a geometry object or a bare
// coordinates array; drops malformed pairs.
export function geojsonToCoords(geometry) {
  const coords = Array.isArray(geometry) ? geometry : geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  const out = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2 || c[0] == null || c[1] == null) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push({ lat, lng });
  }
  return out;
}

export function straightRoute(points) {
  const coords = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const distanceM = pathLengthM(coords);
  return { coords, distanceM, durationS: distanceM / WALK_SPEED_MPS, source: 'straight' };
}

// Parses an OSRM /route response into our route shape, or null if it is not usable.
export function parseOsrmResponse(json, { walkingDuration = true } = {}) {
  if (!json || json.code !== 'Ok' || !json.routes?.length) return null;
  const r = json.routes[0];
  const coords = geojsonToCoords(r.geometry);
  if (coords.length < 2) return null;
  const distanceM = Number.isFinite(r.distance) ? r.distance : pathLengthM(coords);
  const durationS = walkingDuration && Number.isFinite(r.duration) ? r.duration : distanceM / WALK_SPEED_MPS;
  return { coords, distanceM, durationS };
}

// ---------- cache ----------
const CACHE_MAX = 40;
const cache = new Map(); // key -> route (insertion-ordered, oldest evicted first)
const cacheKey = (points) => points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');

export function clearRouteCache() {
  cache.clear();
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new Error('Route request timed out'));
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetchImpl(url, { signal: ctrl?.signal, headers: { Accept: 'application/json' } }), timeout]);
    if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
    return await Promise.race([res.json(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Returns { coords: [{lat,lng}], distanceM, durationS, source } — never throws.
export async function fetchWalkingRoute(points, { timeoutMs = ROUTE_TIMEOUT_MS, fetchImpl = defaultFetch, providers = PROVIDERS } = {}) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) return straightRoute(pts);

  const key = cacheKey(pts);
  if (cache.has(key)) return cache.get(key);

  const deadline = Date.now() + timeoutMs;
  if (typeof fetchImpl === 'function') {
    for (const p of providers) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      try {
        const json = await fetchJson(buildRouteUrl(pts, p.base), fetchImpl, left);
        const parsed = parseOsrmResponse(json, { walkingDuration: p.walkingDuration });
        if (parsed) {
          const route = { ...parsed, source: p.id };
          cache.set(key, route);
          if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
          return route;
        }
      } catch {
        // try the next provider
      }
    }
  }
  return straightRoute(pts); // not cached: retry the network next time
}

// Debounced fetcher: rapid waypoint edits only hit the network for the latest set of points.
// request(points, onResult) — onResult is called only for the most recent request.
export function createRouteFetcher({ debounceMs = 450, ...opts } = {}) {
  let timer = null;
  let seq = 0;
  return {
    request(points, onResult) {
      const id = ++seq;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const route = await fetchWalkingRoute(points, opts);
        if (id === seq) onResult(route);
      }, debounceMs);
    },
    cancel() {
      seq++;
      clearTimeout(timer);
    },
  };
}
