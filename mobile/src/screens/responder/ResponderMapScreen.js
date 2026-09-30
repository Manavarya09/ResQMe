import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radar, Plane, ChevronRight, Locate } from 'lucide-react-native';
import { Text } from '../../components/Text';
import RMap from '../../components/map/RMap';
import { PressScale, Pill } from '../../components/ui';
import { TRIGGER_LABEL } from '../../context/EmergencyContext';
import { useLocation } from '../../context/LocationContext';
import { useResponderIncidents } from '../../hooks/useResponderIncidents';
import { severityMeta } from '../../lib/incidentFormat';
import { timeAgo } from '../../lib/responderQueue';
import { colors, raised, severityColor } from '../../theme';

const DRONE_STATUS = { idle: 'Idle', en_route: 'En route', on_scene: 'On scene', returning: 'Returning' };

export default function ResponderMapScreen({ navigation }) {
  const { location } = useLocation();
  const q = useResponderIncidents();
  const [focus, setFocus] = useState(null); // {lat,lng} to pan to
  const [now, setNow] = useState(Date.now());

  // drones move every second in the simulator; the socket pushes changes, this is the backup
  useEffect(() => {
    const id = setInterval(() => { q.loadDrones(); setNow(Date.now()); }, 5000);
    return () => clearInterval(id);
  }, [q.loadDrones]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (inc) => navigation.navigate('ResponderIncident', { id: inc.id, incident: inc });

  const markers = useMemo(() => {
    const m = q.active.map((inc) => ({
      id: `i${inc.id}`, lat: inc.lat, lng: inc.lng, kind: 'incident',
      color: severityColor[inc.severity] || colors.red,
      title: `${inc.user?.name || 'Caller'} · ${TRIGGER_LABEL[inc.trigger] || 'Alert'}`,
      onPress: () => open(inc),
    }));
    q.drones.forEach((d) => m.push({ id: `d${d.id}`, lat: d.lat, lng: d.lng, kind: 'drone', title: `${d.name} · ${DRONE_STATUS[d.status] || d.status}` }));
    return m;
  }, [q.active, q.drones]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = q.active[0];
  const center = focus || (first ? { lat: first.lat, lng: first.lng } : location);
  const flying = q.drones.filter((d) => d.status !== 'idle').length;

  return (
    <View className="flex-1 bg-bg-base">
      <RMap center={center} user={location} markers={markers} follow zoom={13} />

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View className="mx-4 mt-2 rounded-2xl bg-white/90 px-4 py-3 flex-row items-center gap-3" style={raised(0.5)}>
          <Radar color={colors.primary} size={20} />
          <View className="flex-1">
            <Text className="text-sm font-extrabold text-slate-800">Live operations</Text>
            <Text className="text-[11px] font-semibold text-slate-500">
              {`${q.active.length} active incident${q.active.length === 1 ? '' : 's'} · ${flying} of ${q.drones.length} drones flying`}
            </Text>
          </View>
          <PressScale onPress={() => setFocus({ lat: location.lat, lng: location.lng })} accessibilityLabel="Center on me">
            <View className="w-11 h-11 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
              <Locate color={colors.sub} size={18} />
            </View>
          </PressScale>
        </View>
      </SafeAreaView>

      <View className="absolute left-0 right-0 bottom-0 bg-bg-base rounded-t-[32px] pt-3 pb-4" style={raised(1)}>
        <View className="w-12 h-1.5 rounded-full bg-slate-300 self-center mb-3" />
        {q.active.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {q.active.map((inc) => {
              const sev = severityMeta(inc.severity);
              return (
                <PressScale key={inc.id} onPress={() => open(inc)} accessibilityLabel={`Open incident for ${inc.user?.name || 'caller'}`}>
                  <View className="w-60 rounded-2xl bg-bg-base border border-white p-3.5" style={raised(0.5)}>
                    <View className="flex-row items-center justify-between mb-1.5">
                      {sev ? <Pill label={sev.label} color={sev.color} /> : <View />}
                      <Text className="text-[11px] font-semibold text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>{timeAgo(inc.createdAt, now)}</Text>
                    </View>
                    <Text className="text-sm font-extrabold text-slate-700" numberOfLines={1}>{inc.user?.name || 'Unknown caller'}</Text>
                    <View className="flex-row items-center justify-between mt-1">
                      <Text className="text-[11px] font-semibold text-slate-400 flex-1" numberOfLines={1}>{TRIGGER_LABEL[inc.trigger] || 'Alert'}</Text>
                      <Text className="text-[11px] font-extrabold text-primary">Open</Text>
                      <ChevronRight color={colors.primary} size={14} />
                    </View>
                  </View>
                </PressScale>
              );
            })}
          </ScrollView>
        ) : (
          <View className="flex-row items-center gap-3 px-5 py-2">
            <Plane color={colors.muted} size={18} />
            <Text className="text-xs font-semibold text-slate-400 flex-1">No active incidents. Drones are shown at their stations.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
