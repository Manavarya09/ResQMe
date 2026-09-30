import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Linking, Alert, Platform } from 'react-native';
import Text from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Siren, Phone, Bot, Plane, GraduationCap, ShieldCheck, MapPin, HeartPulse, Users, CheckCircle2, Circle, WifiOff, ChevronDown } from 'lucide-react-native';
import RMap from '../components/map/RMap';
import { Card, Button, PressScale, Pill } from '../components/ui';
import { useEmergency, TRIGGER_LABEL } from '../context/EmergencyContext';
import { useLocation } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { getCountry } from '../lib/dialCodes';
import { haversineM, formatDistance } from '../lib/geo';
import { colors, raised, severityColor } from '../theme';

const DONE = ['resolved', 'cancelled'];

function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000)) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function IncidentScreen({ navigation }) {
  const { incident, drone, error, pendingSync, cancelIncident, requestDrone, dismissIncident } = useEmergency();
  const { location } = useLocation();
  const { user } = useAuth();
  const [droneBusy, setDroneBusy] = useState(false);
  const [droneErr, setDroneErr] = useState(null);
  const elapsed = useElapsed(incident?.createdAt);
  const country = getCountry(user?.country);

  const markers = useMemo(() => {
    const m = [];
    if (incident?.lat) m.push({ id: 'inc', lat: incident.lat, lng: incident.lng, kind: 'incident', color: severityColor[incident.severity] || colors.red, title: 'Alert location' });
    if (drone) m.push({ id: 'drone', lat: drone.lat, lng: drone.lng, kind: 'drone', title: drone.name });
    return m;
  }, [incident?.lat, incident?.lng, incident?.severity, drone]);
  const lines = useMemo(() => (drone && drone.status !== 'idle' ? [{ id: 'dl', coords: [drone, location], color: '#1e293b', width: 2, dashed: true }] : []), [drone, location]);

  if (!incident) {
    return (
      <SafeAreaView className="flex-1 bg-bg-base items-center justify-center p-8">
        <ShieldCheck color={colors.green} size={48} />
        <Text className="text-xl font-extrabold text-slate-800 mt-3">No active emergency</Text>
        <View className="w-full mt-6"><Button title="Back" onPress={() => navigation.goBack()} /></View>
      </SafeAreaView>
    );
  }

  const done = DONE.includes(incident.status);
  const acknowledged = ['acknowledged', 'dispatched', 'resolved'].includes(incident.status) || incident.responderEtaMinutes != null;
  const droneLabel = drone
    ? { en_route: `En route · ${drone.etaSeconds != null ? `${Math.ceil(drone.etaSeconds / 60)} min` : formatDistance(haversineM(drone, incident))}`, on_scene: 'On scene — streaming to responders', returning: 'Returning to base', idle: 'Standing by' }[drone.status]
    : null;

  const steps = [
    { label: 'Alert sent', detail: incident.offline ? 'Offline — call & SMS instead' : `${TRIGGER_LABEL[incident.trigger]} · ${new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, done: !incident.offline },
    { label: 'Responder acknowledged', detail: acknowledged ? (incident.responderEtaMinutes != null ? `Help arriving in ~${incident.responderEtaMinutes} min` : 'A responder is on it') : 'Waiting for a responder…', done: acknowledged },
    { label: 'Drone reconnaissance', detail: droneLabel || (incident.droneId ? 'Dispatched' : 'Not requested'), done: drone?.status === 'on_scene' },
    { label: incident.status === 'cancelled' ? 'Cancelled — you are safe' : 'Resolved', detail: done ? 'Incident closed' : 'Stay where you are if it is safe', done },
  ];

  const onCancel = () => {
    const go = () => cancelIncident();
    if (Platform.OS === 'web') return go();
    Alert.alert("You're safe?", 'This tells responders the emergency is over.', [{ text: 'Not yet', style: 'cancel' }, { text: "Yes, I'm safe", onPress: go }]);
  };

  const onDrone = async () => {
    setDroneBusy(true);
    setDroneErr(null);
    try {
      await requestDrone();
    } catch (e) {
      setDroneErr(e.message);
    } finally {
      setDroneBusy(false);
    }
  };

  const close = () => {
    dismissIncident();
    navigation.goBack();
  };

  return (
    <View className="flex-1 bg-bg-base">
      <SafeAreaView edges={['top']} style={{ backgroundColor: done ? colors.green : colors.redDark }}>
        <View className="px-5 pt-2 pb-4 flex-row items-center gap-3">
          <PressScale onPress={() => navigation.goBack()} accessibilityLabel="Minimise">
            <View className="w-10 h-10 rounded-full bg-white/15 items-center justify-center"><ChevronDown color="#fff" size={22} /></View>
          </PressScale>
          <View className="flex-1">
            <Text className="text-white text-xl font-extrabold">{done ? 'Emergency closed' : 'Emergency active'}</Text>
            <Text className="text-white/80 text-xs font-semibold">{TRIGGER_LABEL[incident.trigger]} · {elapsed} elapsed</Text>
          </View>
          {done ? <ShieldCheck color="#fff" size={26} /> : <Siren color="#fff" size={26} />}
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {(incident.offline || error) && (
          <View className="mx-5 mt-4 rounded-2xl bg-orange-50 border border-orange-200 p-3 flex-row items-center gap-3">
            <WifiOff color={colors.primary} size={18} />
            <View className="flex-1">
              <Text className="text-xs font-bold text-orange-800">
                {incident.offline ? `Couldn't reach ResQMe cloud. Call ${country.primary} now — your contacts have been sent an SMS with your location.` : error}
              </Text>
              {pendingSync ? <Text className="text-[11px] font-semibold text-orange-700 mt-1">Retrying every 10 s — responders are alerted as soon as you're back online.</Text> : null}
            </View>
          </View>
        )}

        <View className="mx-5 mt-4 rounded-3xl overflow-hidden" style={[{ height: 220 }, raised(0.8)]}>
          <RMap center={incident.lat ? { lat: incident.lat, lng: incident.lng } : location} user={location} markers={markers} polylines={lines} zoom={14} />
        </View>

        <View className="px-5 mt-5">
          <PressScale onPress={() => Linking.openURL(`tel:${country.primary}`)}>
            <View className="h-16 rounded-2xl bg-accent-red flex-row items-center justify-center gap-3" style={raised(0.6)}>
              <Phone color="#fff" size={22} />
              <Text className="text-white text-lg font-extrabold">Call {country.primary} now</Text>
            </View>
          </PressScale>
        </View>

        {/* Progress */}
        <Card className="mx-5 mt-5">
          {steps.map((s, i) => (
            <View key={s.label} className="flex-row gap-3">
              <View className="items-center">
                {s.done ? <CheckCircle2 color={colors.green} size={22} /> : <Circle color={colors.muted} size={22} />}
                {i < steps.length - 1 && <View className="w-0.5 flex-1 my-1" style={{ backgroundColor: s.done ? colors.green : '#cbd5e1', minHeight: 18 }} />}
              </View>
              <View className="flex-1 pb-4">
                <Text className={`text-sm font-extrabold ${s.done ? 'text-slate-800' : 'text-slate-500'}`}>{s.label}</Text>
                <Text className="text-xs text-slate-400 font-semibold mt-0.5">{s.detail}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* AI triage */}
        {incident.triage && (
          <Card className="mx-5 mt-5">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">AI triage</Text>
              <Pill label={`${incident.severity || incident.triage.severity} severity`} color={severityColor[incident.severity || incident.triage.severity]} />
            </View>
            <Text className="text-sm text-slate-700 font-semibold leading-5">{incident.triage.summary}</Text>
            {incident.triage.recommendedActions?.slice(0, 4).map((a, i) => (
              <View key={a} className="flex-row gap-2 mt-2">
                <Text className="text-xs font-black text-primary">{i + 1}.</Text>
                <Text className="text-xs text-slate-600 font-medium flex-1">{a}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* What was shared */}
        <Card className="mx-5 mt-5 p-4">
          <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Shared with responders</Text>
          <Shared icon={MapPin} label="Live location" on={!incident.offline} />
          <Shared icon={HeartPulse} label="Medical ID" on={!!incident.medicalSnapshot} offLabel="Withheld (consent off / not set up)" />
          <Shared icon={Users} label={`Emergency contacts (${incident.contactsSnapshot?.length || 0})`} on={(incident.contactsSnapshot?.length || 0) > 0} offLabel="None added" />
        </Card>

        {/* Actions */}
        <View className="px-5 mt-5 gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="AI guide" variant="ghost" icon={Bot} onPress={() => { navigation.goBack(); navigation.navigate('Tabs', { screen: 'Chat' }); }} />
            </View>
            <View className="flex-1">
              <Button title="First aid" variant="ghost" icon={GraduationCap} onPress={() => navigation.navigate('Training')} />
            </View>
          </View>
          {!done && !drone && !incident.droneId && (
            <Button title="Request drone" icon={Plane} onPress={onDrone} loading={droneBusy} />
          )}
          {droneErr ? <Text className="text-red-500 text-xs font-bold text-center">{droneErr}</Text> : null}
          {done ? (
            <Button title="Close" variant="success" icon={ShieldCheck} onPress={close} />
          ) : (
            <Button title="I'm safe — cancel alert" variant="success" icon={ShieldCheck} onPress={onCancel} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Shared({ icon: Icon, label, on, offLabel }) {
  return (
    <View className="flex-row items-center gap-3 py-1.5">
      <Icon color={on ? colors.green : colors.muted} size={16} />
      <Text className="text-sm font-bold text-slate-700 flex-1">{label}</Text>
      <Text className="text-[11px] font-extrabold" style={{ color: on ? colors.green : colors.muted }}>{on ? 'SENT' : offLabel || 'NO'}</Text>
    </View>
  );
}
