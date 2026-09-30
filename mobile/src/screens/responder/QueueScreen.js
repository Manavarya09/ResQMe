import React, { useEffect, useMemo, useState } from 'react';
import { View, SectionList, RefreshControl, ActivityIndicator } from 'react-native';
import { Siren, ShieldCheck, WifiOff, ChevronRight, RotateCw, Plane, Clock } from 'lucide-react-native';
import { Text } from '../../components/Text';
import { Screen, Header, Card, Pill, EmptyState, Button, SectionLabel } from '../../components/ui';
import { TRIGGER_LABEL } from '../../context/EmergencyContext';
import { TRIGGER_ICON } from '../HistoryScreen';
import { useResponderIncidents } from '../../hooks/useResponderIncidents';
import { statusMeta, severityMeta } from '../../lib/incidentFormat';
import { isActive, timeAgo } from '../../lib/responderQueue';
import { colors, severityColor } from '../../theme';

const CLOSED_SHOWN = 15;

export default function QueueScreen({ navigation }) {
  const q = useResponderIncidents();
  const [now, setNow] = useState(Date.now());

  // keep "time ago" fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const sections = useMemo(() => {
    const out = [{ key: 'active', title: 'Needs attention', data: q.active }];
    if (q.closed.length) out.push({ key: 'closed', title: 'Recently closed', data: q.closed.slice(0, CLOSED_SHOWN) });
    return out;
  }, [q.active, q.closed]);

  const open = (inc) => navigation.navigate('ResponderIncident', { id: inc.id, incident: inc });
  const awaiting = q.active.filter((i) => i.status === 'open').length;

  let body;
  if (q.loading) {
    body = (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
        <Text className="text-xs font-semibold text-slate-400 mt-3">Loading the queue…</Text>
      </View>
    );
  } else if (q.error && !q.incidents?.length) {
    body = (
      <View className="px-5 mt-2">
        <Card>
          <EmptyState
            icon={WifiOff}
            title="Couldn’t load incidents"
            body={q.error}
            action={<Button title="Try again" size="sm" icon={RotateCw} onPress={q.refresh} />}
          />
        </Card>
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(i) => String(i.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <>
            {q.error ? (
              <View className="rounded-2xl bg-orange-50 border border-orange-200 px-4 py-3 mb-3 flex-row items-center gap-2">
                <WifiOff color={colors.primary} size={14} />
                <Text className="text-xs font-bold text-orange-800 flex-1">Couldn’t refresh — {q.error}</Text>
              </View>
            ) : null}
            <View className="flex-row gap-3 mt-1">
              <Stat label="Active" value={q.active.length} />
              <Stat label="Critical" value={q.counts.critical} color={q.counts.critical ? colors.red : undefined} />
              <Stat label="Waiting" value={awaiting} color={awaiting ? colors.primary : undefined} />
            </View>
          </>
        }
        renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
        renderSectionFooter={({ section }) =>
          section.key === 'active' && section.data.length === 0 ? (
            <Card>
              <EmptyState icon={ShieldCheck} title="All clear" body="No open incidents. New alerts appear here instantly, with a vibration and a banner." />
            </Card>
          ) : null
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => <QueueRow inc={item} now={now} onPress={() => open(item)} />}
      />
    );
  }

  return (
    <Screen>
      <Header
        title="Incident queue"
        subtitle={q.loading ? 'Connecting…' : `${q.active.length} active · sorted by severity`}
        right={<Pill label="Live" color={colors.green} />}
      />
      {body}
    </Screen>
  );
}

function Stat({ label, value, color }) {
  return (
    <Card className="flex-1 p-3.5" depth={0.6}>
      <Text className="text-2xl font-extrabold text-slate-800" style={[{ fontVariant: ['tabular-nums'] }, color ? { color } : null]}>{value}</Text>
      <Text className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mt-0.5" numberOfLines={1}>{label}</Text>
    </Card>
  );
}

export function QueueRow({ inc, now, onPress }) {
  const Icon = TRIGGER_ICON[inc.trigger] || Siren;
  const st = statusMeta(inc.status);
  const sev = severityMeta(inc.severity || inc.triage?.severity);
  const live = isActive(inc);
  const tint = live ? severityColor[inc.severity] || colors.red : colors.muted;
  return (
    <Card onPress={onPress} className="p-4" depth={0.7}>
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: `${tint}1a` }}>
          <Icon color={tint} size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-slate-700" numberOfLines={1}>{inc.user?.name || 'Unknown caller'}</Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Clock color={colors.muted} size={11} />
            <Text className="text-[11px] font-semibold text-slate-400" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
              {`${TRIGGER_LABEL[inc.trigger] || 'Alert'} · ${timeAgo(inc.createdAt, now)}`}
            </Text>
          </View>
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </View>
      {inc.triage?.summary ? (
        <Text className="text-xs text-slate-500 font-medium mt-3 leading-5" numberOfLines={2}>{inc.triage.summary}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2 mt-3">
        {sev ? <Pill label={sev.label} color={live ? sev.color : colors.muted} /> : null}
        <Pill label={st.label} color={st.color} />
        {inc.responderEtaMinutes != null && live ? <Pill label={`ETA ${inc.responderEtaMinutes} min`} color={colors.primary} /> : null}
        {inc.droneId && live ? (
          <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: `${colors.sub}14` }}>
            <Plane color={colors.sub} size={10} />
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Drone</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
