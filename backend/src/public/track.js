/* ResQMe live location page (/t/:token). Served from 'self' so the page needs no inline script. */
(function () {
  'use strict';
  var POLL_MS = 10000;
  var token = document.body.getAttribute('data-token');
  var state = null;
  var map = null;
  var marker = null;
  var ring = null;
  var ended = false;

  var TRIGGERS = { sos: 'SOS', impact: 'Impact detected', route_deviation: 'Route deviation', timer_expired: 'Check-in missed', manual: 'Manual alert' };
  var STATUSES = { open: 'Waiting for responder', acknowledged: 'Responder on the way', dispatched: 'Help dispatched', resolved: 'Resolved', cancelled: 'Cancelled' };

  function $(id) { return document.getElementById(id); }

  function ago(iso) {
    if (!iso) return '–';
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'updated ' + s + ' s ago';
    var m = Math.round(s / 60);
    if (m < 60) return 'updated ' + m + ' min ago';
    return 'updated ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago';
  }

  function left(iso) {
    var ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'ended';
    var m = Math.ceil(ms / 60000);
    var at = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (m < 60) return 'in ' + m + ' min (' + at + ')';
    return 'in ' + Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') + ' (' + at + ')';
  }

  function pill(text, cls) {
    var el = document.createElement('span');
    el.className = 'pill' + (cls ? ' ' + cls : '');
    el.textContent = text;
    return el;
  }

  function renderIncident(inc) {
    var box = $('incident');
    if (!inc) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    var pills = $('incidentPills');
    pills.textContent = '';
    pills.appendChild(pill(TRIGGERS[inc.trigger] || inc.trigger, 'danger'));
    var sev = String(inc.severity || '');
    pills.appendChild(pill(sev.charAt(0).toUpperCase() + sev.slice(1) + ' severity', sev === 'critical' || sev === 'high' ? 'danger' : 'accent'));
    var closed = inc.status === 'resolved' || inc.status === 'cancelled';
    pills.appendChild(pill(STATUSES[inc.status] || inc.status, closed ? 'ok' : 'accent'));
    box.querySelector('.label').textContent = closed ? 'Emergency closed' : 'Emergency in progress';
    box.style.borderLeftColor = closed ? '#16a34a' : '#ef4444';
    $('incidentHint').textContent = closed
      ? 'The emergency has been closed. Location sharing continues until the link expires.'
      : 'Emergency services and contacts have been alerted by ResQMe.';
  }

  function renderMap(d) {
    if (d.lat == null || d.lng == null || typeof L === 'undefined') return;
    $('noFix').classList.add('hidden');
    var ll = [d.lat, d.lng];
    if (!map) {
      map = L.map('map', { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(ll, 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      ring = L.circle(ll, { radius: d.accuracy || 0, color: '#f48c25', weight: 1, fillColor: '#f48c25', fillOpacity: 0.12 }).addTo(map);
      marker = L.circleMarker(ll, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#f48c25', fillOpacity: 1 }).addTo(map);
    } else {
      marker.setLatLng(ll);
      ring.setLatLng(ll);
      ring.setRadius(d.accuracy || 0);
      if (!map.getBounds().pad(-0.2).contains(ll)) map.panTo(ll);
    }
    $('directions').href = 'https://www.google.com/maps/search/?api=1&query=' + d.lat + ',' + d.lng;
  }

  function tick() {
    if (!state) return;
    $('updated').textContent = ago(state.updatedAt);
    $('expires').textContent = left(state.expiresAt);
    var stale = Date.now() - new Date(state.updatedAt).getTime() > 2 * 60 * 1000;
    $('live').classList.toggle('stale', stale || ended);
    $('liveText').textContent = ended ? 'Ended' : (stale ? 'Last known location' : 'Live');
  }

  function apply(d) {
    state = d;
    renderMap(d);
    renderIncident(d.incident);
    tick();
  }

  function end() {
    ended = true;
    // the server renders the definitive "sharing has ended" page
    window.location.reload();
  }

  function poll() {
    fetch('/api/public/track/' + encodeURIComponent(token), { cache: 'no-store', credentials: 'omit' })
      .then(function (r) {
        if (r.status === 404 || r.status === 410) { end(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (d) { if (d) apply(d); })
      .catch(function () { /* offline: keep showing the last known location */ });
  }

  try { apply(JSON.parse($('initial').textContent)); } catch (e) { /* ignore */ }
  setInterval(poll, POLL_MS);
  setInterval(tick, 1000);
})();
