import { haversineM, distanceToPathM, checkCorridor, pathLengthM, formatDistance } from '../src/lib/geo';

const delhi = { lat: 28.6139, lng: 77.209 };

describe('geo', () => {
  test('haversine ~111 km per degree of latitude', () => {
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  test('distance to a straight path is perpendicular distance', () => {
    const path = [delhi, { lat: delhi.lat + 0.01, lng: delhi.lng }]; // north ~1.1 km
    const p = { lat: delhi.lat + 0.005, lng: delhi.lng + 0.001 }; // ~98 m east of the line
    const d = distanceToPathM(p, path);
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(110);
  });

  test('distance beyond the path end measures to the endpoint', () => {
    const path = [delhi, { lat: delhi.lat + 0.01, lng: delhi.lng }];
    const p = { lat: delhi.lat + 0.02, lng: delhi.lng };
    expect(distanceToPathM(p, path)).toBeCloseTo(haversineM(p, path[1]), -1);
  });

  test('single-point path falls back to point distance', () => {
    const p = { lat: delhi.lat + 0.001, lng: delhi.lng };
    expect(distanceToPathM(p, [delhi])).toBeCloseTo(haversineM(p, delhi), 0);
  });

  test('corridor check flags deviation beyond corridor width', () => {
    const path = [delhi, { lat: delhi.lat + 0.01, lng: delhi.lng }];
    expect(checkCorridor({ lat: delhi.lat + 0.005, lng: delhi.lng + 0.0005 }, path, 150).inside).toBe(true);
    const out = checkCorridor({ lat: delhi.lat + 0.005, lng: delhi.lng + 0.01 }, path, 150);
    expect(out.inside).toBe(false);
    expect(out.distanceM).toBeGreaterThan(900);
  });

  test('path length and distance formatting', () => {
    const path = [delhi, { lat: delhi.lat + 0.01, lng: delhi.lng }, { lat: delhi.lat + 0.02, lng: delhi.lng }];
    expect(pathLengthM(path)).toBeCloseTo(haversineM(path[0], path[2]), -1);
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(2350)).toBe('2.4 km');
  });
});
