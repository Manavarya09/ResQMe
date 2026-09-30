import React from 'react';
import { View, Text, ScrollView, Linking, Platform } from 'react-native';
import { Siren, Shield, Flame, Ambulance, PhoneCall, Activity, MapPin, Route, Bot, GraduationCap, ChevronRight, Zap, HeartHandshake } from 'lucide-react-native';
import { Screen, Card, PressScale, SectionLabel, Pill, IconButton } from '../components/ui';
import SOSButton from '../components/SOSButton';
import HazardIcon, { hazardLabel } from '../components/HazardIcon';
import { useAuth } from '../context/AuthContext';
import { useEmergency, TRIGGER_LABEL } from '../context/EmergencyContext';
import { useLocation } from '../context/LocationContext';
import { useTracking } from '../context/TrackingContext';
import { useHazards } from '../hooks/useHazards';
import { getCountry } from '../lib/dialCodes';
import { formatDistance } from '../lib/geo';
import { colors, raised, severityColor } from '../theme';

const DIAL_ICON = { police: Shield, ambulance: Ambulance, fire: Flame, women: HeartHandshake };
const DIAL_COLOR = { police: colors.blue, ambulance: colors.red, fire: colors.primary, women: '#db2777' };

const call = (n) => Linking.openURL(`tel:${n}`).catch(() => {});

export default function HomeScreen({ navigation }) {
  const { user, settings } = useAuth();
  const { requestEmergency, isActive, incident, sensorsActive, simulateImpact } = useEmergency();
  const { hasFix, location } = useLocation();
  const tracking = useTracking();
  const { hazards } = useHazards();
  const country = getCountry(user?.country);
  const firstName = (user?.name || 'there').split(' ')[0];
  const top = hazards[0];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View className="flex-row items-center justify-between px-5 pt-2">
          <View>
            <Text className="text-text-sub text-xs font-bold uppercase tracking-widest">ResQMe</Text>
            <Text className="text-2xl font-extrabold text-slate-800">Hi, {firstName}</Text>
          </View>
          <IconButton onPress={() => navigation.navigate('Settings')} size={44} accessibilityLabel="Settings">
            <Text className="text-primary font-extrabold">{firstName[0]?.toUpperCase()}</Text>
          </IconButton>
        </View>

        {/* Active incident banner */}
        {isActive && (
          <PressScale onPress={() => navigation.navigate('Incident')}>
            <View className="mx-5 mt-4 rounded-2xl bg-accent-red p-4 flex-row items-center gap-3" style={raised(0.6)}>
              <Siren color="#fff" size={22} />
              <View className="flex-1">
                <Text className="text-white font-extrabold">Emergency active</Text>
                <Text className="text-red-100 text-xs font-semibold">{TRIGGER_LABEL[incident.trigger]} · {incident.status}</Text>
              </View>
              <ChevronRight color="#fff" size={20} />
            </View>
          </PressScale>
        )}

        {/* Hazard banner */}
        {top && (
          <PressScale onPress={() => navigation.navigate('Map')}>
            <View className="mx-5 mt-4 rounded-2xl p-3.5 flex-row items-center gap-3 bg-bg-base border border-white" style={raised(0.6)}>
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${severityColor[top.severity]}1f` }}>
                <HazardIcon type={top.type} color={severityColor[top.severity]} size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: severityColor[top.severity] }}>
                  {hazardLabel[top.type]} · {formatDistance(top.distanceM)}
                </Text>
                <Text className="text-sm font-bold text-slate-700" numberOfLines={1}>{top.title}</Text>
              </View>
              <Text className="text-xs font-bold text-slate-400">+{Math.max(0, hazards.length - 1)}</Text>
            </View>
          </PressScale>
        )}

        {/* SOS */}
        <View className="items-center mt-4">
          <SOSButton active={isActive} onTrigger={() => requestEmergency('sos')} />
          <Text className="text-xs text-slate-400 font-semibold text-center px-10 -mt-1">
            Alerts responders with your live location and medical ID, and texts your emergency contacts.
          </Text>
        </View>

        {/* Status chips */}
        <View className="flex-row gap-3 px-5 mt-6">
          <Card className="flex-1 p-3.5" depth={0.7}>
            <View className="flex-row items-center gap-2 mb-1.5">
              <Activity color={sensorsActive ? colors.green : colors.muted} size={16} />
              <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Crash detect</Text>
            </View>
            {sensorsActive ? (
              <Pill label="Armed" color={colors.green} />
            ) : settings.impactDetection && Platform.OS === 'web' ? (
              <PressScale onPress={simulateImpact} accessibilityLabel="Simulate impact">
                <View className="flex-row items-center gap-1"><Zap color={colors.primary} size={12} /><Text className="text-xs font-extrabold text-primary">Simulate impact</Text></View>
              </PressScale>
            ) : (
              <Pill label={settings.impactDetection ? 'No sensor' : 'Off'} color={colors.muted} />
            )}
          </Card>
          <Card className="flex-1 p-3.5" depth={0.7}>
            <View className="flex-row items-center gap-2 mb-1.5">
              <MapPin color={hasFix ? colors.green : colors.primary} size={16} />
              <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Location</Text>
            </View>
            <Pill label={hasFix ? `GPS ±${Math.round(location.accuracy || 0)}m` : 'Approximate'} color={hasFix ? colors.green : colors.primary} />
          </Card>
        </View>

        {/* Quick dial */}
        <SectionLabel className="mx-5">{`Quick dial · ${country.flag} ${country.name}`}</SectionLabel>
        <View className="px-5">
          <PressScale onPress={() => call(country.primary)} accessibilityLabel={`Call ${country.primary}`}>
            <View className="h-16 rounded-2xl bg-slate-800 flex-row items-center justify-center gap-3 mb-4" style={raised(0.6)}>
              <PhoneCall color="#fff" size={22} />
              <Text className="text-white text-lg font-extrabold tracking-wide">Call {country.primary}</Text>
            </View>
          </PressScale>
          <View className="flex-row gap-3">
            {country.numbers.map((n) => {
              const Icon = DIAL_ICON[n.key] || PhoneCall;
              return (
                <PressScale key={n.key} onPress={() => call(n.number)} style={{ flex: 1 }} accessibilityLabel={`Call ${n.label}`}>
                  <View className="rounded-2xl bg-bg-base border border-white items-center py-3.5" style={raised(0.6)}>
                    <View className="w-10 h-10 rounded-full items-center justify-center mb-1.5" style={{ backgroundColor: `${DIAL_COLOR[n.key]}1a` }}>
                      <Icon color={DIAL_COLOR[n.key]} size={20} />
                    </View>
                    <Text className="text-[11px] font-extrabold text-slate-700" numberOfLines={1}>{n.label}</Text>
                    <Text className="text-[10px] font-bold text-slate-400">{n.number}</Text>
                  </View>
                </PressScale>
              );
            })}
          </View>
        </View>

        {/* Shortcuts */}
        <SectionLabel className="mx-5">Stay safe</SectionLabel>
        <View className="px-5 gap-3">
          <Shortcut
            icon={Route}
            color={colors.primary}
            title={tracking.status === 'tracking' ? 'Safety walk in progress' : 'Walk with me'}
            body={tracking.status === 'tracking' ? 'We alert help if you leave the route or run late' : 'Draw a route and set a time limit — we watch over you'}
            onPress={() => navigation.navigate('Map')}
          />
          <Shortcut icon={Bot} color={colors.blue} title="AI crisis guide" body="Step-by-step help for injuries, panic and danger" onPress={() => navigation.navigate('Chat')} />
          <Shortcut icon={GraduationCap} color={colors.green} title="2-minute first aid" body="CPR, bleeding, choking, burns and more" onPress={() => navigation.navigate('Training')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Shortcut({ icon: Icon, color, title, body, onPress }) {
  return (
    <Card onPress={onPress} className="p-4 flex-row items-center gap-4" depth={0.7}>
      <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
        <Icon color={color} size={22} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-extrabold text-slate-700">{title}</Text>
        <Text className="text-xs text-slate-400 font-medium mt-0.5">{body}</Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Card>
  );
}
