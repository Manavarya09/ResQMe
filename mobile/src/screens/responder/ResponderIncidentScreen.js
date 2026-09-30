import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Linking } from 'react-native';
import {
  Phone, Siren, Brain, UserCheck, Plane, CheckCircle2, XCircle, ShieldOff, Circle, WifiOff, RotateCw, MapPin, Gauge, Navigation,
} from 'lucide-react-native';
import { Text } from '../../components/Text';
import RMap from '../../components/map/RMap';
import { Screen, Header, Card, Inset, Pill, SectionLabel, EmptyState, Button, PressScale } from '../../components/ui';
import { TRIGGER_LABEL } from '../../context/EmergencyContext';
import { useResponderIncidents } from '../../hooks/useResponderIncidents';
import { api } from '../../lib/api';
import { statusMeta, severityMeta, formatClock, formatDay } from '../../lib/incidentFormat';
import { isActive, timeAgo, telLink, ETA_CHOICES } from '../../lib/responderQueue';
import { colors, raised, severityColor } from '../../theme';

const EVENT_META = {
  created: { icon: Siren, color: colors.red },
  triaged: { icon: Brain, color: colors.primary },
  medical_withheld: { icon: ShieldOff, color: colors.muted },
  acknowledged: { icon: UserCheck, color: colors.primary },
  drone_dispatched: { icon: Plane, color: colors.primary },
  resolved: { icon: CheckCircle2, color: colors.green },
  cancelled: { icon: XCircle, color: colors.muted },
};

const CLASSIFICATION = { vehicle_crash: 'Vehicle crash', fall: 'Fall', drop: 'Phone drop', none: 'No impact' };

const call = (phone) => { if (phone) Linking.openURL(telLink(phone)).catch(() => {}); };

export default function ResponderIncidentScreen({ navigation, route }) {
  const id = route.params?.id;
  const q = useResponderIncidents();
  const fromQueue = q.incidents?.find((i) => i.id === id);
  const [inc, setInc] = useState(route.params?.incident || null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [eta, setEta] = useState(10);
  const [busy, setBusy] = useState(null); // 'ack' | 'drone' | 'resolve'
  const [actionError, setActionError] = useState(null);
  const [confirmResolve, setConfirmResolve] = useState(false);

  const load = useCallback(async () => {
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

  // live: socket updates land in the queue store — mirror them here and refetch the timeline
  const liveStamp = fromQueue ? `${fromQueue.status}|${fromQueue.updatedAt}|${fromQueue.droneId}|${fromQueue.responderEtaMinutes}` : null;
  useEffect(() => {
    if (!fromQueue) return;
    setInc((cur) => (cur ? { ...cur, ...fromQueue } : fromQueue));
    load();
  }, [liveStamp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fromQueue && inc && (fromQueue.lat !== inc.lat || fromQueue.lng !== inc.lng)) {
      setInc((cur) => ({ ...cur, lat: fromQueue.lat, lng: fromQueue.lng }));
    }
  }, [fromQueue?.lat, fromQueue?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const drone = inc?.droneId ? q.drones.find((d) => d.id === inc.droneId) : null;

  const markers = useMemo(() => {
    if (inc?.lat == null) return [];
    const m = [{ id: 'inc', lat: inc.lat, lng: inc.lng, kind: 'incident', color: severityColor[inc.severity] || colors.red, title: 'Caller location' }];
    if (drone && drone.status !== 'idle') m.push({ id: 'drone', lat: drone.lat, lng: drone.lng, kind: 'drone', title: drone.name });
    return m;
  }, [inc?.lat, inc?.lng, inc?.severity, drone?.lat, drone?.lng, drone?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (kind, fn) => {
    setBusy(kind);
    setActionError(null);
    try {
      const res = await fn();
      if (res && res.id === id) { setInc((cur) => ({ ...cur, ...res })); q.merge(res); }
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const acknowledge = () => run('ack', () => api.ackIncident(id, eta));
  const dispatch = () => run('drone', async () => { await api.dispatchDrone(id); q.loadDrones(); return null; });
  const resolve = () => {
    if (!confirmResolve) { setConfirmResolve(true); return; }
    setConfirmResolve(false);
    run('resolve', () => api.resolveIncident(id));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), q.loadDrones()]);
    setRefreshing(false);
  };

  const openDirections = () => {
    if (inc?.lat == null) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${inc.lat},${inc.lng}`).catch(() => {});
  };

  if (!inc) {
    return (
      <Screen>
        <Header title="Incident" onBack={() => navigation.goBack()} />
        {events === null ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : (
          <View className="px-5">
            <Card>
              <EmptyState icon={WifiOff} title="Couldn’t load this incident" body={error} action={<Button title="Try again" size="sm" icon={RotateCw} onPress={load} />} />
            </Card>
          </View>
        )}
      </Screen>
    );
  }

  const st = statusMeta(inc.status);
  const sev = severityMeta(inc.severity || inc.triage?.severity);
  const live = isActive(inc);
  const triage = inc.triage;
  const med = inc.medicalSnapshot;
  const contacts = inc.contactsSnapshot || [];
  const impact = inc.impactScore;
  const acked = inc.responderEtaMinutes != null;

  return (
    <Screen>
      <Header
        title={TRIGGER_LABEL[inc.trigger] || 'Incident'}
        subtitle={`${formatDay(inc.createdAt)} · ${formatClock(inc.createdAt)} · ${timeAgo(inc.createdAt)}`}
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
          {acked && live ? <Pill label={`ETA ${inc.responderEtaMinutes} min`} color={colors.primary} /> : null}
        </View>

        {error ? (
          <View className="rounded-2xl bg-orange-50 border border-orange-200 px-4 py-3 mb-4 flex-row items-center gap-2">
            <WifiOff color={colors.primary} size={14} />
            <Text className="text-xs font-bold text-orange-800 flex-1">{error}</Text>
          </View>
        ) : null}

        {/* Caller */}
        <Card className="p-4 mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-lg font-extrabold">{(inc.user?.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-slate-800" numberOfLines={1}>{inc.user?.name || 'Unknown caller'}</Text>
              <Text className="text-xs font-semibold text-slate-400 mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{inc.user?.phone || 'No phone on file'}</Text>
            </View>
            {inc.user?.phone ? (
              <PressScale onPress={() => call(inc.user.phone)} accessibilityLabel={`Call ${inc.user?.name || 'caller'}`}>
                <View className="h-12 px-4 rounded-2xl bg-primary flex-row items-center gap-2" style={raised(0.5)}>
                  <Phone color="#fff" size={18} />
                  <Text className="text-sm font-extrabold text-white uppercase tracking-wide">Call</Text>
                </View>
              </PressScale>
            ) : null}
          </View>
          {inc.note ? (
            <Inset className="mt-4 py-3">
              <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Caller note</Text>
              <Text className="text-sm font-semibold text-slate-700">{inc.note}</Text>
            </Inset>
          ) : null}
        </Card>

        {/* Map */}
        {inc.lat != null ? (
          <>
            <View className="rounded-3xl overflow-hidden" style={[{ height: 210 }, raised(0.8)]}>
              <RMap center={{ lat: inc.lat, lng: inc.lng }} markers={markers} zoom={15} follow />
            </View>
            <View className="flex-row items-center justify-between mt-2.5 ml-1">
              <View className="flex-row items-center gap-1.5 flex-1">
                <MapPin color={colors.muted} size={12} />
                <Text className="text-[11px] font-semibold text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>
                  {`${Number(inc.lat).toFixed(5)}, ${Number(inc.lng).toFixed(5)}${inc.accuracy ? ` · ±${Math.round(inc.accuracy)} m` : ''}`}
                </Text>
              </View>
              <PressScale onPress={openDirections} accessibilityLabel="Directions">
                <View className="flex-row items-center gap-1 px-2 min-h-[32px]">
                  <Navigation color={colors.primary} size={13} />
                  <Text className="text-[11px] font-extrabold text-primary">Directions</Text>
                </View>
              </PressScale>
            </View>
          </>
        ) : null}

        {/* Actions */}
        {live ? (
          <>
            <SectionLabel>Respond</SectionLabel>
            <Card>
              <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 ml-1">
                {acked ? 'Update your ETA' : 'Your ETA'}
              </Text>
              <View className="flex-row gap-2 mb-4">
                {ETA_CHOICES.map((m) => (
                  <PressScale key={m} onPress={() => setEta(m)} style={{ flex: 1 }} accessibilityLabel={`${m} minutes`}>
                    <View className={`h-11 rounded-xl items-center justify-center ${eta === m ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                      <Text className={`text-sm font-extrabold ${eta === m ? 'text-white' : 'text-slate-500'}`}>{`${m} min`}</Text>
                    </View>
                  </PressScale>
                ))}
              </View>
              <Button title={acked ? `Update ETA · ${eta} min` : `Acknowledge · ${eta} min`} icon={UserCheck} onPress={acknowledge} loading={busy === 'ack'} disabled={!!busy && busy !== 'ack'} />
              <View className="flex-row gap-3 mt-3">
                <View className="flex-1">
                  <Button
                    title={inc.droneId ? 'Drone out' : 'Drone'}
                    variant="ghost"
                    icon={Plane}
                    onPress={dispatch}
                    loading={busy === 'drone'}
                    disabled={(!!busy && busy !== 'drone') || !!inc.droneId}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title={confirmResolve ? 'Confirm' : 'Resolve'}
                    variant={confirmResolve ? 'success' : 'ghost'}
                    icon={CheckCircle2}
                    onPress={resolve}
                    loading={busy === 'resolve'}
                    disabled={!!busy && busy !== 'resolve'}
                  />
                </View>
              </View>
              {drone && drone.status !== 'idle' ? (
                <Text className="text-[11px] font-semibold text-slate-400 mt-3 px-1" style={{ fontVariant: ['tabular-nums'] }}>
                  {`${drone.name} · ${drone.status.replace('_', ' ')}${drone.etaSeconds ? ` · ETA ${Math.max(1, Math.round(drone.etaSeconds / 60))} min` : ''} · battery ${Math.round(drone.batteryPct)}%`}
                </Text>
              ) : null}
              {confirmResolve ? (
                <Text className="text-[11px] font-semibold text-slate-400 mt-3 px-1">Tap Confirm to close this incident. The caller is notified.</Text>
              ) : null}
              {actionError ? <Text className="text-[11px] font-bold text-red-500 mt-3 px-1">{actionError}</Text> : null}
            </Card>
          </>
        ) : (
          <Card className="p-4 mt-4 flex-row items-center gap-3" depth={0.7}>
            <CheckCircle2 color={inc.status === 'resolved' ? colors.green : colors.muted} size={20} />
            <Text className="text-sm font-extrabold text-slate-700 flex-1">
              {inc.status === 'resolved' ? 'This incident is resolved' : 'Cancelled by the caller (false alarm)'}
            </Text>
          </Card>
        )}

        {/* Medical */}
        <SectionLabel>Medical</SectionLabel>
        {med ? (
          <Card>
            <View className="flex-row gap-4">
              <View className="w-24 rounded-2xl items-center justify-center py-3" style={{ backgroundColor: `${colors.red}14` }}>
                <Text className="text-3xl font-extrabold" style={{ color: colors.red }}>{med.bloodType || '?'}</Text>
                <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mt-1">Blood</Text>
              </View>
              <View className="flex-1 justify-center">
                <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">Allergies</Text>
                {med.allergies?.length ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {med.allergies.map((a) => (
                      <View key={a} className="px-2.5 py-1 rounded-full" style={{ backgroundColor: `${colors.red}1a` }}>
                        <Text className="text-xs font-extrabold" style={{ color: colors.red }}>{a}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-xs font-semibold text-slate-400">None reported</Text>
                )}
              </View>
            </View>
            <MedList title="Conditions" items={med.conditions} />
            <MedList
              title="Medications"
              items={(med.medications || []).map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' · '))}
            />
            {med.notes ? <MedList title="Notes" items={[med.notes]} /> : null}
            {med.organDonor ? <Text className="text-[11px] font-semibold text-slate-400 mt-3">Registered organ donor</Text> : null}
          </Card>
        ) : (
          <Card>
            <View className="flex-row items-center gap-3">
              <ShieldOff color={colors.muted} size={18} />
              <Text className="text-xs font-semibold text-slate-400 flex-1">The caller did not share a medical ID with this alert.</Text>
            </View>
          </Card>
        )}

        {/* Triage */}
        <SectionLabel right={triage?.source ? <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{triage.source === 'llm' ? 'AI triage' : 'Rule-based'}</Text> : null}>
          Triage
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
              <Meter label="Confidence" value={triage.confidence} />
            ) : null}
          </Card>
        ) : (
          <Card><Text className="text-xs font-semibold text-slate-400">No triage was recorded for this alert.</Text></Card>
        )}

        {/* Impact */}
        {impact ? (
          <>
            <SectionLabel>Impact analysis</SectionLabel>
            <Card>
              <View className="flex-row items-center gap-3 mb-1">
                <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
                  <Gauge color={colors.primary} size={18} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-extrabold text-slate-700">{CLASSIFICATION[impact.classification] || impact.classification || 'Impact'}</Text>
                  <Text className="text-[11px] font-semibold text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>
                    {impact.peakG != null ? `Peak ${Number(impact.peakG).toFixed(1)} g` : 'Peak unknown'}
                    {impact.impactDetected === false ? ' · no impact confirmed' : ''}
                  </Text>
                </View>
              </View>
              {typeof impact.score === 'number' ? <Meter label="Impact score" value={impact.score} /> : null}
            </Card>
          </>
        ) : null}

        {/* Contacts */}
        <SectionLabel>Emergency contacts</SectionLabel>
        <Inset className="p-0">
          {contacts.length ? contacts.map((c, i) => (
            <View key={c.id || `${c.phone}${i}`} className={`flex-row items-center gap-3 py-3 px-3 ${i === contacts.length - 1 ? '' : 'border-b border-slate-200/70'}`}>
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-700" numberOfLines={1}>
                  {c.name}{c.isPrimary ? <Text className="text-[11px] font-extrabold text-primary">{'  Primary'}</Text> : null}
                </Text>
                <Text className="text-[11px] font-semibold text-slate-400 mt-0.5" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                  {`${c.relation || 'Contact'} · ${c.phone}`}
                </Text>
              </View>
              <PressScale onPress={() => call(c.phone)} accessibilityLabel={`Call ${c.name}`}>
                <View className="w-11 h-11 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
                  <Phone color={colors.primary} size={17} />
                </View>
              </PressScale>
            </View>
          )) : (
            <Text className="text-xs font-semibold text-slate-400 p-4">No emergency contacts on file.</Text>
          )}
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
        <Text className="text-[10px] font-bold text-slate-400 text-center mt-5 tracking-widest uppercase">Ref {String(inc.id).slice(0, 8)}</Text>
      </ScrollView>
    </Screen>
  );
}

function MedList({ title, items }) {
  return (
    <View className="mt-4">
      <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">{title}</Text>
      {items?.length ? items.map((x, i) => (
        <Text key={`${i}${x}`} className="text-sm font-semibold text-slate-700 leading-6">{x}</Text>
      )) : <Text className="text-xs font-semibold text-slate-400">None reported</Text>}
    </View>
  );
}

function Meter({ label, value }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View className="mt-4">
      <View className="flex-row justify-between mb-1.5">
        <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</Text>
        <Text className="text-[11px] font-extrabold text-slate-600" style={{ fontVariant: ['tabular-nums'] }}>{pct}%</Text>
      </View>
      <View className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <View className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}
