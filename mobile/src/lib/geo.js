const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Distance from p to segment a–b using a local equirectangular projection (accurate for city-scale routes).
function distanceToSegmentM(p, a, b) {
  const kx = Math.cos(toRad(p.lat)) * R;
  const ax = toRad(a.lng) * kx, ay = toRad(a.lat) * R;
  const bx = toRad(b.lng) * kx, by = toRad(b.lat) * R;
  const px = toRad(p.lng) * kx, py = toRad(p.lat) * R;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToPathM(p, path) {
  if (!path?.length) return Infinity;
  if (path.length === 1) return haversineM(p, path[0]);
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) min = Math.min(min, distanceToSegmentM(p, path[i], path[i + 1]));
  return min;
}

export function checkCorridor(p, path, corridorM = 150) {
  const distanceM = distanceToPathM(p, path);
  return { inside: distanceM <= corridorM, distanceM };
}

export function pathLengthM(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineM(path[i - 1], path[i]);
  return total;
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function mapsLink({ lat, lng }) {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
