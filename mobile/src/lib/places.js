// Nearest hospitals and police stations from OpenStreetMap (Overpass API).
import { haversineM } from './geo';

// Wrap fetch: calling a detached window.fetch reference throws "Illegal invocation" in browsers.
const defaultFetch = typeof fetch === 'function' ? (...args) => fetch(...args) : null;

export const PLACES_RADIUS_M = 3000;
export const PLACES_TIMEOUT_MS = 8000; // per request (and the Overpass server-side [timeout:8])
export const PLACES_TOTAL_TIMEOUT_MS = 14000; // hedged requests to mirrors share this overall budget
export const PLACES_TTL_MS = 10 * 60 * 1000;
const REUSE_WITHIN_M = 400; // a cached result is reused while the user stays this close to where it was fetched

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter', // public mirrors, used when the main instance is busy
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export const PLACE_LABEL = { hospital: 'Hospital', police: 'Police' };

export function buildOverpassQuery({ lat, lng }, radiusM = PLACES_RADIUS_M) {
  const around = `around:${Math.round(radiusM)},${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `[out:json][timeout:8];(nwr["amenity"~"^(hospital|police)$"](${around}););out center tags 60;`;
}

const phoneOf = (tags) => {
  const raw = tags['contact:phone'] || tags.phone || tags['emergency:phone'] || tags['contact:mobile'];
  if (!raw) return null;
  return String(raw).split(/[;,]/)[0].trim() || null;
};

// Overpass JSON -> [{ id, kind, name, lat, lng, phone, distanceM }] sorted by distance.
export function parseOverpass(json, from) {
  const out = [];
  const seen = new Set();
  for (const el of json?.elements || []) {
    const tags = el.tags || {};
    const kind = tags.amenity;
    if (kind !== 'hospital' && kind !== 'police') continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `${el.type || 'n'}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = tags.name || tags['name:en'] || tags.operator || PLACE_LABEL[kind];
    out.push({ id, kind, name, lat, lng, phone: phoneOf(tags), distanceM: from ? haversineM(from, { lat, lng }) : null });
  }
  return out.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

let cache = null; // { at, center, places }
export function clearPlacesCache() {
  cache = null;
}

// `cancel` is a small { onCancel(fn) } hook used to stop losing hedged requests.
async function postOverpass(url, query, fetchImpl, timeoutMs, cancel) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new Error('Nearby places request timed out'));
    }, timeoutMs);
    cancel?.onCancel(() => {
      clearTimeout(timer);
      ctrl?.abort();
      reject(new Error('cancelled'));
    });
  });
  try {
    const res = await Promise.race([
      fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl?.signal,
      }),
      timeout,
    ]);
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json = await Promise.race([res.json(), timeout]);
    if (!Array.isArray(json?.elements)) throw new Error('Overpass returned no elements');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// Returns places sorted by distance (recomputed from `location`). Throws only if every endpoint
// fails and nothing is cached.
export async function fetchNearbyHelp(location, { radiusM = PLACES_RADIUS_M, timeoutMs = PLACES_TIMEOUT_MS, totalTimeoutMs = Math.max(timeoutMs, PLACES_TOTAL_TIMEOUT_MS), staggerMs = 3000, fetchImpl = defaultFetch, force = false } = {}) {
  const withDistance = (places) =>
    places.map((p) => ({ ...p, distanceM: haversineM(location, p) })).sort((a, b) => a.distanceM - b.distanceM);

  if (!force && cache && Date.now() - cache.at < PLACES_TTL_MS && haversineM(cache.center, location) < REUSE_WITHIN_M) {
    return withDistance(cache.places);
  }
  if (typeof fetchImpl !== 'function') throw new Error('Network unavailable');

  const query = buildOverpassQuery(location, radiusM);
  try {
    const json = await hedgedRequest(OVERPASS_ENDPOINTS, (url, left, cancel) => postOverpass(url, query, fetchImpl, Math.min(timeoutMs, left), cancel), { timeoutMs: totalTimeoutMs, staggerMs });
    const places = parseOverpass(json, location);
    cache = { at: Date.now(), center: { lat: location.lat, lng: location.lng }, places };
    return places;
  } catch (e) {
    if (cache) return withDistance(cache.places); // stale but better than nothing
    throw e;
  }
}

// Public Overpass instances are often slow or overloaded, so requests are hedged: the main
// instance starts immediately, and each mirror joins after `staggerMs` (or at once when an earlier
// request fails). The first good response wins; everything shares one overall deadline.
function hedgedRequest(urls, run, { timeoutMs, staggerMs }) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let next = 0;
    let pending = 0;
    let done = false;
    let lastErr = null;
    let stagger = null;
    const cancellers = [];
    const cancel = { onCancel: (fn) => cancellers.push(fn) };
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(stagger);
      clearTimeout(overall);
      cancellers.forEach((c) => c()); // stop the requests that lost the race
      fn(v);
    };
    const launch = () => {
      if (done || next >= urls.length) return;
      const left = deadline - Date.now();
      if (left <= 0) return;
      const url = urls[next++];
      pending++;
      clearTimeout(stagger);
      if (next < urls.length) stagger = setTimeout(launch, staggerMs);
      run(url, left, cancel).then(
        (v) => finish(resolve, v),
        (e) => {
          lastErr = e;
          pending--;
          if (next < urls.length) launch();
          else if (!pending) finish(reject, lastErr);
        }
      );
    };
    const overall = setTimeout(() => finish(reject, lastErr || new Error('Nearby places request timed out')), timeoutMs);
    launch();
  });
}

export function directionsUrl({ lat, lng }, origin) {
  const o = origin ? `&origin=${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=walking`;
}

export const telUrl = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
