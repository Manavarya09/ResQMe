import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Siren, X, ChevronRight } from 'lucide-react-native';
import { Text } from '../../components/Text';
import { PressScale } from '../../components/ui';
import { TRIGGER_LABEL } from '../../context/EmergencyContext';
import { useResponderIncidents } from '../../hooks/useResponderIncidents';
import { severityMeta } from '../../lib/incidentFormat';
import { navigate } from '../../navigation/ref';
import { colors, raised } from '../../theme';

// Slides in from the top on every `incident:new`, on whichever responder tab is open.
export default function NewIncidentBanner() {
  const { banner, dismissBanner } = useResponderIncidents();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;

  useEffect(() => {
    Animated.spring(y, { toValue: banner ? 0 : -160, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
  }, [banner, y]);

  if (!banner) return null;
  const sev = severityMeta(banner.severity);
  const critical = banner.severity === 'critical' || banner.severity === 'high';
  const tint = critical ? colors.red : colors.primary;

  const open = () => {
    dismissBanner();
    navigate('ResponderIncident', { id: banner.id, incident: banner });
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 50, transform: [{ translateY: y }] }}
    >
      <PressScale onPress={open} accessibilityLabel="Open new incident">
        <View className="rounded-3xl bg-bg-base border border-white p-4 flex-row items-center gap-3" style={raised(1)}>
          <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: tint }}>
            <Siren color="#fff" size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: tint }} numberOfLines={1}>
              {`New · ${TRIGGER_LABEL[banner.trigger] || 'Alert'}${sev ? ` · ${sev.label}` : ''}`}
            </Text>
            <Text className="text-sm font-extrabold text-slate-800 mt-0.5" numberOfLines={1}>
              {banner.user?.name || 'Unknown caller'}
            </Text>
            {banner.triage?.summary ? (
              <Text className="text-[11px] font-semibold text-slate-500 mt-0.5" numberOfLines={1}>{banner.triage.summary}</Text>
            ) : null}
          </View>
          <ChevronRight color={colors.muted} size={18} />
          <PressScale onPress={dismissBanner} accessibilityLabel="Dismiss">
            <View className="w-11 h-11 items-center justify-center">
              <X color={colors.muted} size={18} />
            </View>
          </PressScale>
        </View>
      </PressScale>
    </Animated.View>
  );
}
