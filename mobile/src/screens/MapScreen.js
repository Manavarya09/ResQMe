import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Modal, Pressable, ScrollView, Linking, ActivityIndicator } from 'react-native';
import Text from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Locate, Layers, Play, Square, Undo2, Trash2, ShieldCheck, Megaphone, Timer, Route, CheckCircle2, AlertTriangle, X, Hospital, Shield, Navigation, Phone, Footprints, RefreshCw } from 'lucide-react-native';
import RMap from '../components/map/RMap';
import { PressScale, Button, Field, Pill } from '../components/ui';
import HazardIcon, { hazardLabel } from '../components/HazardIcon';
import { useLocation } from '../context/LocationContext';
import { useTracking } from '../context/TrackingContext';
import { useEmergency } from '../context/EmergencyContext';
import { useHazards } from '../hooks/useHazards';
import { api } from '../lib/api';
import { formatDistance, formatDuration, remainingPathM } from '../lib/geo';
import { fetchNearbyHelp, directionsUrl, telUrl, PLACE_LABEL } from '../lib/places';
import { ROUTE_DEVIATION_GRACE_S } from '../config';
import { colors, raised, inset, severityColor } from '../theme';

const DURATIONS = [10, 15, 25, 30, 45, 60];
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function MapScreen() {
  const { location, hasFix } = useLocation();
  const t = useTracking();
  const { drone, incident, isActive } = useEmergency();
  const { hazards, refresh } = useHazards();
  const [follow, setFollow] = useState(true);
  const [showHazards, setShowHazards] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [sheetH, setSheetH] = useState(180);
  const help = useNearbyHelp(location);

  const markers = useMemo(() => {
    const m = [];
    if (showHazards) hazards.forEach((h) => m.push({ id: `h${h.id}`, lat: h.lat, lng: h.lng, kind: 'hazard', color: severityColor[h.severity], title: h.title }));
    t.waypoints.forEach((w, i) =>
      m.push({ id: `w${i}`, lat: w.lat, lng: w.lng, kind: i === t.waypoints.length - 1 ? 'dest' : 'waypoint', title: i === t.waypoints.length - 1 ? 'Destination' : `Stop ${i + 1}` })
    );
    if (help.enabled) help.places.forEach((p) => m.push({ id: `p${p.id}`, lat: p.lat, lng: p.lng, kind: p.kind, color: PLACE_COLOR[p.kind], title: `${p.name} · ${formatDistance(p.distanceM)}` }));
    if (drone) m.push({ id: 'drone', lat: drone.lat, lng: drone.lng, kind: 'drone', title: `${drone.name} · ${drone.status}` });
    if (isActive && incident?.lat) m.push({ id: 'incident', lat: incident.lat, lng: incident.lng, kind: 'incident', title: 'Your emergency' });
    return m;
  }, [hazards, showHazards, t.waypoints, drone, isActive, incident, help.enabled, help.places]);

  const circles = useMemo(
    () => (showHazards ? hazards.map((h) => ({ id: `c${h.id}`, lat: h.lat, lng: h.lng, radiusM: h.radiusM || 300, color: severityColor[h.severity] })) : []),
    [hazards, showHazards]
  );

  const polylines = useMemo(() => {
    const p = [];
    if (t.routedPath.length > 1) {
      p.push({ id: 'corridor', coords: t.routedPath, color: 'rgba(244,140,37,0.18)', width: 26 });
      p.push({ id: 'route', coords: t.routedPath, color: colors.primary, width: 5, dashed: t.status !== 'tracking' });
    }
    if (t.trail.length > 1) p.push({ id: 'trail', coords: t.trail, color: colors.blue, width: 4 });
    return p;
  }, [t.routedPath, t.trail, t.status]);

  const canPlan = t.status !== 'tracking';
  const info = t.routeInfo;
  const toDest = t.routedPath.length ? remainingPathM(location, t.routedPath) : null;
  const paceMps = info && info.durationS > 0 ? info.distanceM / info.durationS : 1.35;
  const etaS = toDest != null ? toDest / paceMps : null;
  const offFor = t.deviation.since ? Math.floor((Date.now() - t.deviation.since) / 1000) : 0;

  return (
    <View className="flex-1 bg-bg-base">
      <RMap
        center={location}
        user={location}
        markers={markers}
        circles={circles}
        polylines={polylines}
        follow={follow}
        onPress={canPlan ? (p) => { t.addWaypoint(p); setFollow(false); } : undefined}
      />

      {/* Top status */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View className="mx-4 mt-2 rounded-2xl bg-white/90 px-4 py-3 flex-row items-center gap-3" style={raised(0.5)}>
          <Route color={colors.primary} size={20} />
          <View className="flex-1">
            <Text className="text-sm font-extrabold text-slate-800">
              {t.status === 'tracking' ? 'Safety walk active' : t.status === 'arrived' ? 'Arrived safely' : t.waypoints.length ? 'Plan your route' : 'Walk with me'}
            </Text>
            <Text className="text-[11px] font-semibold text-slate-500">
              {t.status === 'tracking'
                ? t.deviation.inside ? 'On route · we alert help if anything changes' : `Off route by ${formatDistance(t.deviation.distanceM)}`
                : canPlan ? 'Tap the map to add stops — the last one is your destination' : ''}
            </Text>
          </View>
          {!hasFix && <Pill label="Approx." color={colors.primary} />}
        </View>
        {t.status === 'tracking' && !t.deviation.inside && (
          <View className="mx-4 mt-2 rounded-2xl bg-accent-red px-4 py-3 flex-row items-center gap-3" style={raised(0.5)}>
            <AlertTriangle color="#fff" size={18} />
            <Text className="text-white font-bold text-xs flex-1">
              You left your route. Alert in {Math.max(0, ROUTE_DEVIATION_GRACE_S - offFor)}s unless you return.
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Floating controls */}
      <View className="absolute right-4 gap-3" style={{ bottom: sheetH + 16 }}>
        <MapFab onPress={() => setFollow(true)} active={follow} icon={Locate} label="Recenter" />
        <MapFab onPress={() => { setShowHazards((v) => !v); refresh(); }} active={showHazards} icon={Layers} label="Toggle hazards" />
        <MapFab onPress={help.toggle} active={help.enabled} icon={Hospital} label="Nearby help" />
        <MapFab onPress={() => setReportOpen(true)} icon={Megaphone} label="Report hazard" />
      </View>

      {/* Bottom sheet */}
      <View
        className="absolute left-0 right-0 bottom-0 bg-bg-base rounded-t-[32px] px-5 pt-3 pb-5"
        style={raised(1)}
        onLayout={(e) => setSheetH(Math.round(e.nativeEvent.layout.height))}
      >
        <View className="w-12 h-1.5 rounded-full bg-slate-300 self-center mb-4" />
        {t.status === 'tracking' ? (
          <>
            <View className="flex-row gap-3 mb-4">
              <Stat icon={Timer} label="Time left" value={fmt(t.remainingS)} color={t.remainingS < 120 ? colors.red : colors.primary} />
              <Stat icon={Route} label="To destination" value={formatDistance(toDest)} color={colors.blue} caption={etaS != null ? `~${formatDuration(etaS)} walk` : null} />
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1"><Button title="Stop" variant="ghost" icon={Square} onPress={t.stop} /></View>
              <View className="flex-1"><Button title="I'm safe" variant="success" icon={ShieldCheck} onPress={t.clear} /></View>
            </View>
          </>
        ) : t.status === 'arrived' ? (
          <View className="items-center">
            <CheckCircle2 color={colors.green} size={40} />
            <Text className="text-lg font-extrabold text-slate-800 mt-2">You arrived safely</Text>
            <Text className="text-xs text-slate-400 mb-4">Tracking stopped automatically.</Text>
            <View className="w-full"><Button title="Done" onPress={t.clear} /></View>
          </View>
        ) : t.waypoints.length ? (
          <>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-lg font-extrabold text-slate-800">Route controls</Text>
                <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t.waypoints.length} stop{t.waypoints.length > 1 ? 's' : ''}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <MapFab onPress={t.undoWaypoint} icon={Undo2} label="Undo" small />
                <MapFab onPress={t.clear} icon={Trash2} label="Clear" small />
              </View>
            </View>
            <RouteSummary info={info} onUseEta={(min) => t.setDurationMin(min)} />
            <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">Time limit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 -mx-1">
              {DURATIONS.map((d) => (
                <PressScale key={d} onPress={() => t.setDurationMin(d)}>
                  <View className={`mx-1 px-4 h-10 rounded-xl items-center justify-center ${t.durationMin === d ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                    <Text className={`text-sm font-extrabold ${t.durationMin === d ? 'text-white' : 'text-slate-500'}`}>{d} min</Text>
                  </View>
                </PressScale>
              ))}
            </ScrollView>
            <Button title="Start tracking" icon={Play} size="lg" onPress={() => { t.start(); setFollow(true); }} />
          </>
        ) : help.enabled ? (
          <NearbyHelpList help={help} location={location} />
        ) : (
          <>
            <Text className="text-lg font-extrabold text-slate-800">Nearby alerts</Text>
            <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Crime & climate · 10 km</Text>
            {hazards.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                {hazards.slice(0, 8).map((h) => (
                  <View key={h.id} className="mx-1 w-56 rounded-2xl bg-bg-base border border-white p-3" style={raised(0.4)}>
                    <View className="flex-row items-center gap-2 mb-1">
                      <HazardIcon type={h.type} color={severityColor[h.severity]} size={16} />
                      <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: severityColor[h.severity] }}>
                        {hazardLabel[h.type]} · {formatDistance(h.distanceM)}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-slate-700" numberOfLines={2}>{h.title}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text className="text-sm text-slate-400">No active hazards near you.</Text>
            )}
          </>
        )}
      </View>

      <ReportHazardModal visible={reportOpen} onClose={() => setReportOpen(false)} location={location} onDone={refresh} />
    </View>
  );
}

function Stat({ icon: Icon, label, value, color, caption }) {
  return (
    <View className="flex-1 rounded-2xl bg-bg-base border border-white p-4" style={raised(0.5)}>
      <View className="flex-row items-center gap-1.5 mb-1">
        <Icon color={color} size={14} />
        <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</Text>
      </View>
      <Text className="text-2xl font-black" style={{ color, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {caption ? <Text className="text-[11px] font-bold text-slate-400 mt-0.5">{caption}</Text> : null}
    </View>
  );
}

// Walking distance + ETA of the planned route (OSRM, or a straight-line estimate when offline).
function RouteSummary({ info, onUseEta }) {
  if (!info) return null;
  const etaMin = Math.max(1, Math.round(info.durationS / 60));
  // Suggest a time limit with ~40% slack, rounded up to 5 min.
  const suggested = Math.min(180, Math.max(10, Math.ceil((etaMin * 1.4) / 5) * 5));
  return (
    <View className="flex-row items-center gap-3 rounded-2xl p-3.5 mb-4" style={inset()}>
      <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
        {info.loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Footprints color={colors.primary} size={18} />}
      </View>
      <View className="flex-1">
        <Text className="text-base font-extrabold text-slate-800" style={{ fontVariant: ['tabular-nums'] }}>
          {formatDistance(info.distanceM)} · {formatDuration(info.durationS)} walk
        </Text>
        <Text className="text-[11px] font-semibold text-slate-400">
          {info.loading ? 'Finding a walking route…' : info.source === 'straight' ? 'Straight-line estimate · routing unavailable' : 'Walking route via OpenStreetMap'}
        </Text>
      </View>
      {!info.loading && (
        <PressScale onPress={() => onUseEta(suggested)} accessibilityLabel={`Set time limit to ${suggested} minutes`}>
          <View className="px-3 h-9 rounded-xl bg-bg-base border border-white items-center justify-center" style={raised(0.4)}>
            <Text className="text-[11px] font-extrabold text-primary">Use {suggested} min</Text>
          </View>
        </PressScale>
      )}
    </View>
  );
}

const PLACE_COLOR = { hospital: colors.red, police: colors.blue };
const PLACE_ICON = { hospital: Hospital, police: Shield };

// Toggleable nearest hospitals / police stations (OpenStreetMap Overpass, cached 10 min).
function useNearbyHelp(location) {
  const [enabled, setEnabled] = useState(false);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const locRef = React.useRef(location);
  locRef.current = location;

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setPlaces(await fetchNearbyHelp(locRef.current, { force }));
    } catch {
      setError('Could not reach OpenStreetMap. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  // (Re)load when switched on and when the user has moved ~100 m (the fetcher's cache absorbs small moves).
  const key = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
  useEffect(() => {
    if (enabled) load();
  }, [enabled, key, load]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);
  const reload = useCallback(() => load(true), [load]);
  return { enabled, toggle, places, loading, error, reload };
}

function NearbyHelpList({ help, location }) {
  const open = (url) => Linking.openURL(url).catch(() => {});
  return (
    <>
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-extrabold text-slate-800">Nearby help</Text>
        <PressScale onPress={help.reload} accessibilityLabel="Refresh nearby help">
          {help.loading ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.muted} size={16} />}
        </PressScale>
      </View>
      <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Hospitals & police · 3 km</Text>
      {help.loading && !help.places.length ? (
        <View className="flex-row items-center gap-2 py-3">
          <ActivityIndicator color={colors.primary} />
          <Text className="text-sm text-slate-400">Searching OpenStreetMap…</Text>
        </View>
      ) : help.error && !help.places.length ? (
        <Text className="text-sm text-slate-400">{help.error}</Text>
      ) : help.places.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
          {help.places.slice(0, 12).map((p) => {
            const Icon = PLACE_ICON[p.kind];
            const c = PLACE_COLOR[p.kind];
            return (
              <View key={p.id} className="mx-1 w-60 rounded-2xl bg-bg-base border border-white p-3" style={raised(0.4)}>
                <View className="flex-row items-center gap-2 mb-1">
                  <Icon color={c} size={16} />
                  <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: c }}>
                    {PLACE_LABEL[p.kind]} · {formatDistance(p.distanceM)}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-slate-700 mb-2.5" numberOfLines={1}>{p.name}</Text>
                <View className="flex-row gap-2">
                  <PressScale onPress={() => open(directionsUrl(p, location))} style={{ flex: 1 }} accessibilityLabel={`Directions to ${p.name}`}>
                    <View className="h-9 rounded-xl bg-primary flex-row items-center justify-center gap-1.5" style={raised(0.3)}>
                      <Navigation color="#fff" size={13} />
                      <Text className="text-[11px] font-extrabold text-white uppercase tracking-wide">Directions</Text>
                    </View>
                  </PressScale>
                  {p.phone ? (
                    <PressScale onPress={() => open(telUrl(p.phone))} accessibilityLabel={`Call ${p.name}`}>
                      <View className="h-9 px-3 rounded-xl bg-bg-base border border-white flex-row items-center justify-center gap-1.5" style={raised(0.3)}>
                        <Phone color={colors.primary} size={13} />
                        <Text className="text-[11px] font-extrabold text-primary uppercase tracking-wide">Call</Text>
                      </View>
                    </PressScale>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text className="text-sm text-slate-400">No hospitals or police stations mapped within 3 km.</Text>
      )}
    </>
  );
}

function MapFab({ icon: Icon, onPress, active, label, small }) {
  const s = small ? 40 : 48;
  return (
    <PressScale onPress={onPress} accessibilityLabel={label}>
      <View className="rounded-2xl bg-bg-base items-center justify-center border border-white" style={[{ width: s, height: s }, raised(0.6)]}>
        <Icon color={active ? colors.primary : '#475569'} size={small ? 18 : 22} />
      </View>
    </PressScale>
  );
}

const REPORT_TYPES = ['crime', 'accident', 'flood', 'fog', 'heat', 'other'];

function ReportHazardModal({ visible, onClose, location, onDone }) {
  const [type, setType] = useState('crime');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.reportHazard({ type, title: title.trim() || hazardLabel[type], lat: location.lat, lng: location.lng });
      setTitle('');
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="bg-bg-base rounded-t-[32px] p-6 pb-10">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xl font-extrabold text-slate-800">Report a hazard</Text>
          <PressScale onPress={onClose}><X color={colors.muted} size={22} /></PressScale>
        </View>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {REPORT_TYPES.map((k) => (
            <PressScale key={k} onPress={() => setType(k)}>
              <View className={`flex-row items-center gap-1.5 px-3 h-10 rounded-xl ${type === k ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                <HazardIcon type={k} color={type === k ? '#fff' : colors.sub} size={16} />
                <Text className={`text-xs font-extrabold ${type === k ? 'text-white' : 'text-slate-500'}`}>{hazardLabel[k]}</Text>
              </View>
            </PressScale>
          ))}
        </View>
        <Field label="What's happening?" value={title} onChangeText={setTitle} placeholder="e.g. Street lights out, suspicious group" />
        {err ? <Text className="text-red-500 text-xs font-bold mb-3">{err}</Text> : null}
        <Button title="Share with community" onPress={submit} loading={busy} />
        <Text className="text-[10px] text-slate-400 text-center mt-3">Reported at your current location. Visible to nearby ResQMe users.</Text>
      </View>
    </Modal>
  );
}
