import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import {
  Siren, Brain, UserCheck, Plane, CheckCircle2, XCircle, ShieldOff, MapPin, Circle, WifiOff, RotateCw, HeartPulse, Users, Activity, ChevronRight,
} from 'lucide-react-native';
import { Text } from '../components/Text';
import RMap from '../components/map/RMap';
import { Screen, Header, Card, Inset, Pill, SectionLabel, EmptyState, Button } from '../components/ui';
import { TRIGGER_LABEL, useEmergency } from '../context/EmergencyContext';
import { api } from '../lib/api';
import { ACTIVE_STATUSES, statusMeta, severityMeta, formatDay, formatClock, formatDuration } from '../lib/incidentFormat';
import { colors, raised, severityColor } from '../theme';

const EVENT_META = {
  created: { icon: Siren, color: colors.red },
  triaged: { icon: Brain, color: colors.primary },
  medical_withheld: { icon: ShieldOff, color: colors.muted },
  acknowledged: { icon: UserCheck, color: colors.primary },
  drone_dispatched: { icon: Plane, color: colors.primary },
  resolved: { icon: CheckCircle2, color: colors.green },
  cancelled: { icon: XCircle, color: colors.muted },
};

export default function IncidentDetailScreen({ navigation, route }) {
  const id = route.params?.id;
  const { incident: active } = useEmergency();
  const [inc, setInc] = useState(route.params?.incident || null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setError('This incident was never delivered to the server.'); setEvents([]); return; }
    try {
      const full = await api.incident(id);
      const { events: ev, ...rest } = full || {};
      setInc(rest);
      setEvents(Array.isArray(ev) ? [...ev].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : []);
      setError(null);
    } catch (e) {
      setError(e.message);
      setEvents((cur) => cur || []);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markers = useMemo(
    () => (inc?.lat != null ? [{ id: 'inc', lat: inc.lat, lng: inc.lng, kind: 'incident', color: severityColor[inc.severity] || colors.red, title: 'Alert location' }] : []),
    [inc?.lat, inc?.lng, inc?.severity]
  );

  if (!inc && events === null) {
    return (
      <Screen>
        <Header title="Incident" onBack={() => navigation.goBack()} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} size="large" /></View>
      </Screen>
    );
  }

  if (!inc) {
    return (
      <Screen>
        <Header title="Incident" onBack={() => navigation.goBack()} />
        <View className="px-5">
          <Card>
            <EmptyState icon={WifiOff} title="Couldn’t load this incident" body={error} action={<Button title="Try again" size="sm" icon={RotateCw} onPress={load} />} />
          </Card>
        </View>
      </Screen>
    );
  }

  const st = statusMeta(inc.status);
  const sev = severityMeta(inc.severity || inc.triage?.severity);
  const live = ACTIVE_STATUSES.includes(inc.status);
  const isCurrent = live && active?.id && active.id === inc.id;
  const closedAt = !live ? events?.find((e) => ['resolved', 'cancelled'].includes(e.type))?.createdAt || inc.updatedAt : null;
  const duration = closedAt ? formatDuration(inc.createdAt, closedAt) : null;
  const triage = inc.triage;

  return (
    <Screen>
      <Header
        title={TRIGGER_LABEL[inc.trigger] || 'Incident'}
        subtitle={`${formatDay(inc.createdAt)} · ${formatClock(inc.createdAt)}${duration ? ` · lasted ${duration}` : ''}`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View className="flex-row flex-wrap gap-2 mb-4">
          <Pill label={st.label} color={st.color} />
          {sev ? <Pill label={`${sev.label} severity`} color={sev.color} /> : null}
          {inc.impactScore?.peakG ? <Pill label={`${Number(inc.impactScore.peakG).toFixed(1)} g impact`} color={colors.sub} /> : null}
        </View>

        {isCurrent ? (
          <Card onPress={() => navigation.navigate('Incident')} className="p-4 mb-4 flex-row items-center gap-3" depth={0.7}>
            <Siren color={colors.red} size={20} />
            <Text className="text-sm font-extrabold text-slate-700 flex-1">This emergency is still active</Text>
            <ChevronRight color={colors.muted} size={18} />
          </Card>
        ) : null}

        {error ? (
          <View className="rounded-2xl bg-orange-50 border border-orange-200 px-4 py-3 mb-4 flex-row items-center gap-2">
            <WifiOff color={colors.primary} size={14} />
            <Text className="text-xs font-bold text-orange-800 flex-1">{error}</Text>
          </View>
        ) : null}

        {/* Map snapshot */}
        {inc.lat != null ? (
          <View className="rounded-3xl overflow-hidden" style={[{ height: 190 }, raised(0.8)]} pointerEvents="none">
            <RMap center={{ lat: inc.lat, lng: inc.lng }} markers={markers} zoom={15} />
          </View>
        ) : null}
        {inc.lat != null ? (
          <View className="flex-row items-center gap-1.5 mt-2.5 ml-1">
            <MapPin color={colors.muted} size={12} />
            <Text className="text-[11px] font-semibold text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>
              {`${Number(inc.lat).toFixed(5)}, ${Number(inc.lng).toFixed(5)}${inc.accuracy ? ` · ±${Math.round(inc.accuracy)} m` : ''}`}
            </Text>
          </View>
        ) : null}

        {/* Triage */}
        <SectionLabel right={triage?.source ? <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{triage.source === 'llm' ? 'AI triage' : 'Rule-based'}</Text> : null}>
          Triage summary
        </SectionLabel>
        {triage ? (
          <Card>
            <Text className="text-[15px] leading-6 font-semibold text-slate-700">{triage.summary}</Text>
            {triage.recommendedActions?.length ? (
              <Inset className="mt-4">
                <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">Recommended actions</Text>
                {triage.recommendedActions.map((a, i) => (
                  <View key={`${i}${a}`} className="flex-row gap-2.5 mb-1.5">
                    <Text className="text-xs font-extrabold text-primary" style={{ fontVariant: ['tabular-nums'] }}>{i + 1}.</Text>
                    <Text className="text-xs font-semibold text-slate-600 flex-1 leading-5">{a}</Text>
                  </View>
                ))}
              </Inset>
            ) : null}
            {typeof triage.confidence === 'number' ? (
              <View className="mt-4">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Confidence</Text>
                  <Text className="text-[11px] font-extrabold text-slate-600" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(triage.confidence * 100)}%</Text>
                </View>
                <View className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <View className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, Math.max(0, triage.confidence)) * 100)}%` }} />
                </View>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card><Text className="text-xs font-semibold text-slate-400">No triage was recorded for this alert.</Text></Card>
        )}

        {/* What was shared */}
        <SectionLabel>Shared with responders</SectionLabel>
        <Inset className="p-0">
          <SharedRow icon={HeartPulse} title="Medical ID" value={inc.medicalSnapshot ? `Blood type ${inc.medicalSnapshot.bloodType || 'unknown'}` : 'Not shared'} />
          <SharedRow icon={Users} title="Emergency contacts" value={inc.contactsSnapshot?.length ? inc.contactsSnapshot.map((c) => c.name).join(', ') : 'None on file'} />
          <SharedRow icon={Activity} title="Responder ETA" value={inc.responderEtaMinutes != null ? `${inc.responderEtaMinutes} min` : '—'} last />
        </Inset>

        {/* Timeline */}
        <SectionLabel>Timeline</SectionLabel>
        <Card>
          {events === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : events.length === 0 ? (
            <Text className="text-xs font-semibold text-slate-400">No events recorded yet.</Text>
          ) : (
            events.map((e, i) => {
              const meta = EVENT_META[e.type] || { icon: Circle, color: colors.muted };
              const last = i === events.length - 1;
              return (
                <View key={e.id || i} className="flex-row gap-3">
                  <View className="items-center">
                    <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: `${meta.color}1a` }}>
                      <meta.icon color={meta.color} size={15} />
                    </View>
                    {!last ? <View className="w-0.5 flex-1 my-1 bg-slate-200" style={{ minHeight: 14 }} /> : null}
                  </View>
                  <View className={`flex-1 ${last ? '' : 'pb-4'}`}>
                    <Text className="text-sm font-bold text-slate-700 leading-5">{e.message}</Text>
                    <Text className="text-[11px] font-semibold text-slate-400 mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>
                      {`${formatClock(e.createdAt)} · ${formatDay(e.createdAt)}`}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>
        {inc.id ? (
          <Text className="text-[10px] font-bold text-slate-400 text-center mt-5 tracking-widest uppercase">Ref {String(inc.id).slice(0, 8)}</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SharedRow({ icon: Icon, title, value, last }) {
  return (
    <View className={`flex-row items-center gap-3 py-3.5 px-3 ${last ? '' : 'border-b border-slate-200/70'}`}>
      <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
        <Icon color={colors.primary} size={18} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-slate-700">{title}</Text>
        <Text className="text-[11px] font-semibold text-slate-400 mt-0.5" numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}
