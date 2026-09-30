import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { markerStyle } from './markers';

// Leaflet + OpenStreetMap implementation for the web preview (react-native-maps has no web support).
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletPromise = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.onload = () => resolve(window.L);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return leafletPromise;
}

function divIcon(L, m) {
  const s = markerStyle(m);
  const inner = s.label
    ? `<span style="color:#fff;font-size:13px;line-height:1">${s.label}</span>`
    : s.inner ? `<span style="width:${s.size / 3}px;height:${s.size / 3}px;border-radius:50%;background:#fff"></span>` : '';
  return L.divIcon({
    className: '',
    iconSize: [s.size, s.size],
    iconAnchor: [s.size / 2, s.size / 2],
    html: `<div style="width:${s.size}px;height:${s.size}px;border-radius:50%;background:${s.bg};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;box-sizing:border-box">${inner}</div>`,
  });
}

const userIcon = (L) =>
  L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: '<div style="width:28px;height:28px;border-radius:50%;background:rgba(244,140,37,.25);display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;border-radius:50%;background:#f48c25;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>',
  });

export default function RMap({ center, user, markers = [], circles = [], polylines = [], onPress, follow = false, zoom = 15, style }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const [L, setL] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((lib) => {
      if (cancelled || !el.current || map.current) return;
      map.current = lib.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
      lib.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
      layer.current = lib.layerGroup().addTo(map.current);
      map.current.on('click', (e) => onPressRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      setL(lib);
      setTimeout(() => map.current?.invalidateSize(), 200);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (L && map.current && follow && center) map.current.panTo([center.lat, center.lng], { animate: true });
  }, [L, follow, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!L || !layer.current) return;
    const g = layer.current;
    g.clearLayers();
    circles.forEach((c) => L.circle([c.lat, c.lng], { radius: c.radiusM, color: c.color, weight: 1.5, fillOpacity: 0.12 }).addTo(g));
    polylines.forEach((p) =>
      L.polyline(p.coords.map((c) => [c.lat, c.lng]), { color: p.color, weight: p.width || 5, dashArray: p.dashed ? '10 8' : null, lineCap: 'round' }).addTo(g)
    );
    markers.forEach((m) => {
      const mk = L.marker([m.lat, m.lng], { icon: divIcon(L, m) });
      if (m.title) mk.bindTooltip(m.title);
      mk.addTo(g);
    });
    if (user) L.marker([user.lat, user.lng], { icon: userIcon(L), zIndexOffset: 1000 }).addTo(g);
  }, [L, markers, circles, polylines, user]);

  return (
    <View style={[{ flex: 1 }, style]}>
      <div ref={el} style={{ width: '100%', height: '100%', background: '#e5e7eb' }} />
    </View>
  );
}
