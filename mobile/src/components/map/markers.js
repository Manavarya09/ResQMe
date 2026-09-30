// Visual language for map markers, shared by the native and web map implementations.
export function markerStyle(m) {
  switch (m.kind) {
    case 'drone':
      return { size: 26, bg: '#1e293b', inner: true, label: '✈' };
    case 'incident':
      return { size: 26, bg: m.color || '#ef4444', inner: true };
    case 'dest':
      return { size: 24, bg: '#ef4444', inner: true };
    case 'waypoint':
      return { size: 16, bg: '#f48c25', inner: false };
    case 'hazard':
      return { size: 18, bg: m.color || '#ca8a04', inner: false };
    default:
      return { size: 18, bg: m.color || '#3b82f6', inner: false };
  }
}
