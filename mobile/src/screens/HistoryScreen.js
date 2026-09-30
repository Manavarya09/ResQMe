import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Siren, Activity, Route, Timer, Hand, ShieldCheck, WifiOff, ChevronRight, RotateCw } from 'lucide-react-native';
import { Text } from '../components/Text';
import { Screen, Header, Card, Pill, EmptyState, Button, SectionLabel } from '../components/ui';
import { TRIGGER_LABEL } from '../context/EmergencyContext';
import { api } from '../lib/api';
import { ACTIVE_STATUSES, statusMeta, severityMeta, formatDay, formatClock, formatRelative } from '../lib/incidentFormat';
import { colors, raised } from '../theme';

export const TRIGGER_ICON = { sos: Siren, impact: Activity, route_deviation: Route, timer_expired: Timer, manual: Hand };

export default function HistoryScreen({ navigation }) {
  const [items, setItems] = useState(null); // null = first load
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await api.incidents();
      setItems(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError(e.message);
      setItems((cur) => cur || []);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stats = useMemo(() => {
    const list = items || [];
    return {
      total: list.length,
      resolved: list.filter((i) => i.status === 'resolved').length,
      falseAlarms: list.filter((i) => i.status === 'cancelled').length,
    };
  }, [items]);

  const open = (inc) => navigation.navigate('IncidentDetail', { id: inc.id, incident: inc });

  let body;
  if (items === null) {
    body = (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
        <Text className="text-xs font-semibold text-slate-400 mt-3">Loading your history…</Text>
      </View>
    );
  } else if (error && items.length === 0) {
    body = (
      <View className="px-5 mt-2">
        <Card>
          <EmptyState
            icon={WifiOff}
            title="Couldn’t load your history"
            body={error}
            action={<Button title="Try again" size="sm" icon={RotateCw} onPress={() => { setItems(null); load(); }} />}
          />
        </Card>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          items.length ? (
            <>
              {error ? (
                <View className="rounded-2xl bg-orange-50 border border-orange-200 px-4 py-3 mb-3 flex-row items-center gap-2">
                  <WifiOff color={colors.primary} size={14} />
                  <Text className="text-xs font-bold text-orange-800 flex-1">Couldn’t refresh — {error}</Text>
                </View>
              ) : null}
              <View className="flex-row gap-3 mt-1">
                <Stat label="Alerts" value={stats.total} />
                <Stat label="Resolved" value={stats.resolved} />
                <Stat label="False alarms" value={stats.falseAlarms} />
              </View>
              <SectionLabel>Newest first</SectionLabel>
            </>
          ) : null
        }
        ListEmptyComponent={
          <Card className="mt-2">
            <EmptyState
              icon={ShieldCheck}
              title="No alerts yet"
              body="When you raise an SOS or ResQMe detects a crash, it’ll be recorded here with its full timeline."
            />
          </Card>
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => <IncidentRow inc={item} onPress={() => open(item)} />}
      />
    );
  }

  return (
    <Screen>
      <Header title="Incident history" subtitle="Every alert you’ve raised" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      {body}
    </Screen>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="flex-1 p-3.5" depth={0.6}>
      <Text className="text-2xl font-extrabold text-slate-800" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mt-0.5">{label}</Text>
    </Card>
  );
}

export function IncidentRow({ inc, onPress }) {
  const Icon = TRIGGER_ICON[inc.trigger] || Siren;
  const st = statusMeta(inc.status);
  const sev = severityMeta(inc.severity || inc.triage?.severity);
  const live = ACTIVE_STATUSES.includes(inc.status);
  return (
    <Card onPress={onPress} className="p-4" depth={0.7}>
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: live ? `${colors.red}1a` : `${colors.primary}14` }}>
          <Icon color={live ? colors.red : colors.primary} size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-slate-700" numberOfLines={1}>{TRIGGER_LABEL[inc.trigger] || 'Alert'}</Text>
          <Text className="text-[11px] font-semibold text-slate-400 mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>
            {`${formatDay(inc.createdAt)} · ${formatClock(inc.createdAt)} · ${formatRelative(inc.createdAt)}`}
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </View>
      {inc.triage?.summary ? (
        <Text className="text-xs text-slate-500 font-medium mt-3 leading-5" numberOfLines={2}>{inc.triage.summary}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2 mt-3">
        <Pill label={st.label} color={st.color} />
        {sev ? <Pill label={sev.label} color={sev.color} /> : null}
      </View>
    </Card>
  );
}
