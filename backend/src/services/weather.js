'use strict';
/**
 * Open-Meteo current conditions → hazards. Cached 10 minutes per ~0.1° cell.
 * Never throws: if Open-Meteo is unreachable, returns [] (or a stale cached value).
 */
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 10 * 60 * 1000;
const HAZARD_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // cellKey -> { at, current }

const cellKey = (lat, lng) => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lng * 10) / 10).toFixed(1)}`;

async function fetchCurrent(lat, lng) {
  const url = `${OPEN_METEO}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    '&current=temperature_2m,precipitation,weather_code,wind_gusts_10m,visibility&hourly=visibility&forecast_days=1&timezone=GMT';
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const body = await res.json();
  const current = { ...(body.current || {}) };
  // visibility is sometimes missing from `current`; fall back to the hourly value for this hour
  if (typeof current.visibility !== 'number' && body.hourly && Array.isArray(body.hourly.visibility)) {
    const hourKey = (current.time || new Date().toISOString()).slice(0, 13);
    const idx = (body.hourly.time || []).findIndex((t) => String(t).startsWith(hourKey));
    const v = body.hourly.visibility[idx >= 0 ? idx : 0];
    if (typeof v === 'number') current.visibility = v;
  }
  return current;
}

/** Pure mapping of Open-Meteo `current` values to hazard descriptors (spec section 3 rules). */
function mapWeatherToHazards(current, lat, lng, fetchedAt = new Date()) {
  if (!current) return [];
  const out = [];
  const key = cellKey(lat, lng);
  const createdAt = new Date(fetchedAt).toISOString();
  const expiresAt = new Date(new Date(fetchedAt).getTime() + HAZARD_TTL_MS).toISOString();
  const add = (type, severity, title, description, radiusM = 5000) => out.push({
    id: `weather:${key}:${type}`, type, severity, title, description, lat, lng, radiusM,
    source: 'open-meteo', createdAt, expiresAt,
  });

  const temp = current.temperature_2m;
  // Open-Meteo `current.precipitation` is the sum over the preceding interval (usually 15 min) → mm/h
  const intervalS = Number(current.interval) || 3600;
  const precipRate = typeof current.precipitation === 'number' ? (current.precipitation * 3600) / intervalS : null;
  const vis = current.visibility;
  const gusts = current.wind_gusts_10m;
  const code = current.weather_code;

  if (typeof temp === 'number' && temp >= 40) {
    add('heat', temp >= 45 ? 'critical' : 'high', `Extreme heat ${Math.round(temp)}°C`,
      'Heatstroke risk. Stay hydrated, avoid direct sun between 12–4 pm.');
  }
  if (precipRate !== null && precipRate >= 10) {
    add('flood', precipRate >= 30 ? 'critical' : 'high', `Heavy rain ${precipRate.toFixed(1)} mm/h – waterlogging risk`,
      'Avoid underpasses and low-lying roads; do not drive through standing water.');
  }
  if (typeof vis === 'number' && vis < 1000) {
    add('fog', vis < 200 ? 'high' : 'medium', `Low visibility ${Math.round(vis)} m`,
      'Dense fog. Drive slowly with low-beam lights and keep distance.');
  }
  const thunder = [95, 96, 99].includes(code);
  const windy = typeof gusts === 'number' && gusts >= 60;
  if (thunder || windy) {
    const hail = code === 96 || code === 99;
    const parts = [];
    if (thunder) parts.push(hail ? 'Thunderstorm with hail' : 'Thunderstorm');
    if (windy) parts.push(`wind gusts ${Math.round(gusts)} km/h`);
    const title = parts.join(', ');
    add('storm', hail || (windy && gusts >= 90) ? 'critical' : 'high', title.charAt(0).toUpperCase() + title.slice(1),
      'Seek shelter indoors, stay away from trees, poles and open ground.');
  }
  return out;
}

async function getWeatherHazards(lat, lng) {
  const key = cellKey(lat, lng);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return mapWeatherToHazards(hit.current, lat, lng, hit.at);
  try {
    const current = await module.exports.fetchCurrent(lat, lng);
    cache.set(key, { at: now, current });
    return mapWeatherToHazards(current, lat, lng, now);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.warn(`[weather] Open-Meteo unavailable: ${err.message}`);
    if (hit) return mapWeatherToHazards(hit.current, lat, lng, hit.at);
    return [];
  }
}

function clearCache() {
  cache.clear();
}

module.exports = { getWeatherHazards, fetchCurrent, mapWeatherToHazards, clearCache, cellKey };
