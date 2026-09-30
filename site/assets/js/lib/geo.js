// Port of mobile/src/lib/geo.js (corridor maths) + backend/src/util.js destinationPoint and
// backend/src/services/drones.js stepDrone (drone kinematics). Same constants as the app.

export const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Nearest point on a path: { index (segment start), t (0..1 along it), distanceM }.
export function nearestOnPath(p, path) {
  if (!path?.length) return null;
  if (path.length === 1) return { index: 0, t: 0, distanceM: haversineM(p, path[0]) };
  let best = { index: 0, t: 0, distanceM: Infinity };
  const kx = Math.cos(toRad(p.lat)) * R;
  const px = toRad(p.lng) * kx, py = toRad(p.lat) * R;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ax = toRad(a.lng) * kx, ay = toRad(a.lat) * R;
    const dx = toRad(b.lng) * kx - ax, dy = toRad(b.lat) * R - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best.distanceM) best = { index: i, t, distanceM: d };
  }
  return best;
}

export function remainingPathM(p, path) {
  if (!path?.length) return Infinity;
  const n = nearestOnPath(p, path);
  if (path.length === 1) return n.distanceM;
  const a = path[n.index], b = path[n.index + 1];
  let total = n.distanceM + haversineM(a, b) * (1 - n.t);
  for (let i = n.index + 1; i < path.length - 1; i++) total += haversineM(path[i], path[i + 1]);
  return total;
}

export function checkCorridor(p, path, corridorM = 150) {
  const n = nearestOnPath(p, path);
  return { inside: n.distanceM <= corridorM, distanceM: n.distanceM, index: n.index, t: n.t };
}

// ---- drones (backend/src/services/drones.js) ----
export const SPEED_MPS = 15;
export const ON_SCENE_M = 30;
export const AT_BASE_M = 5;
export const BATTERY_DRAIN_PER_S = 0.05;
export const MAX_DIRECT_RANGE_M = 25000;

export function destinationPoint(lat, lng, bearingDeg, distM) {
  const d = distM / R;
  const b = toRad(bearingDeg);
  const p1 = toRad(lat);
  const l1 = toRad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: toDeg(p2), lng: ((toDeg(l2) + 540) % 360) - 180 };
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

function moveToward(d, tLat, tLng, dtSec) {
  const dist = haversineM(d, { lat: tLat, lng: tLng });
  const step = SPEED_MPS * dtSec;
  if (dist <= step) return { lat: tLat, lng: tLng, remaining: 0 };
  const p = destinationPoint(d.lat, d.lng, bearingDeg(d.lat, d.lng, tLat, tLng), step);
  return { lat: p.lat, lng: p.lng, remaining: haversineM(p, { lat: tLat, lng: tLng }) };
}

export function stepDrone(drone, target, dtSec = 1) {
  const d = { ...drone };
  const drain = () => { d.batteryPct = Math.max(0, Math.round((d.batteryPct - BATTERY_DRAIN_PER_S * dtSec) * 1000) / 1000); };

  if (d.status === 'en_route' && target) {
    const m = moveToward(d, target.lat, target.lng, dtSec);
    d.lat = m.lat; d.lng = m.lng;
    drain();
    if (m.remaining <= ON_SCENE_M) {
      d.status = 'on_scene';
      d.etaSeconds = 0;
      return { drone: d, changed: true, event: 'arrived_scene' };
    }
    d.etaSeconds = Math.ceil(m.remaining / SPEED_MPS);
    return { drone: d, changed: true, event: null };
  }
  if (d.status === 'on_scene' && target) {
    if (haversineM(d, target) > ON_SCENE_M) {
      d.status = 'en_route';
      return stepDrone(d, target, dtSec);
    }
    return { drone: d, changed: false, event: null };
  }
  if (d.status === 'returning') {
    const m = moveToward(d, d.baseLat, d.baseLng, dtSec);
    d.lat = m.lat; d.lng = m.lng;
    drain();
    if (m.remaining <= AT_BASE_M) {
      d.lat = d.baseLat; d.lng = d.baseLng;
      d.status = 'idle';
      d.incidentId = null;
      d.etaSeconds = null;
      d.batteryPct = 100;
      return { drone: d, changed: true, event: 'arrived_base' };
    }
    d.etaSeconds = Math.ceil(m.remaining / SPEED_MPS);
    return { drone: d, changed: true, event: null };
  }
  return { drone: d, changed: false, event: null };
}
