import React, { useState } from 'react';
import { View, Text, ScrollView, Modal, Pressable, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { QrCode, Radio, AlertTriangle, Activity, Pill as PillIcon, Phone, ChevronRight, Droplet, HeartHandshake, Pencil, Lock, X, Cake } from 'lucide-react-native';
import { Screen, Header, Card, Inset, IconButton, PressScale, Pill, SectionLabel, EmptyState, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useMedical } from '../hooks/useMedical';
import { api } from '../lib/api';
import { API_BASE } from '../config';
import { colors, raised } from '../theme';

function age(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

export default function MedicalIDScreen({ navigation }) {
  const { user, settings, updateSettings } = useAuth();
  const { medical, loading } = useMedical();
  const [qr, setQr] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrErr, setQrErr] = useState(null);

  const openQr = async () => {
    setQrBusy(true);
    setQrErr(null);
    try {
      const t = await api.shareMedical();
      setQr({ ...t, full: t.absoluteUrl || (t.url.startsWith('http') ? t.url : `${API_BASE}${t.url}`) });
    } catch (e) {
      setQrErr(e.message);
      setQr({ error: true });
    } finally {
      setQrBusy(false);
    }
  };

  const years = age(medical?.dateOfBirth);

  return (
    <Screen>
      <Header
        title="Medical ID"
        subtitle="Shared with responders in an emergency"
        right={
          <IconButton onPress={() => navigation.navigate('MedicalEdit')} accessibilityLabel="Edit medical ID">
            <Pencil color={colors.primary} size={18} />
          </IconButton>
        }
      />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}>
        {/* Profile */}
        <Card className="flex-row items-center gap-4 mb-5">
          <View className="w-16 h-16 rounded-full bg-primary items-center justify-center">
            <Text className="text-white text-2xl font-black">{(user?.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-extrabold text-slate-800" numberOfLines={1}>{user?.name}</Text>
            <Text className="text-xs text-slate-400 font-semibold mt-0.5">
              {[years != null ? `${years} yrs` : null, medical?.heightCm ? `${medical.heightCm} cm` : null, medical?.weightKg ? `${medical.weightKg} kg` : null].filter(Boolean).join(' · ') || 'Add your details'}
            </Text>
            <Pill label={medical ? 'Active profile' : 'Incomplete'} color={medical ? colors.primary : colors.muted} className="mt-2" />
          </View>
          <PressScale onPress={openQr} accessibilityLabel="Show responder QR code">
            <View className="w-12 h-12 rounded-xl bg-bg-base items-center justify-center border border-white" style={raised(0.6)}>
              {qrBusy ? <ActivityIndicator color={colors.primary} /> : <QrCode color="#475569" size={22} />}
            </View>
          </PressScale>
        </Card>

        {/* Auto-transmit */}
        <Card className="flex-row items-center gap-4 mb-5 p-4">
          <View className="w-12 h-12 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.5)}>
            <Radio color={colors.primary} size={22} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-extrabold text-slate-800">Auto-transmit</Text>
            <Text className="text-[11px] text-slate-400 font-medium">Attach to every alert so responders prepare before arrival</Text>
          </View>
          <PressScale onPress={() => updateSettings({ shareMedical: !settings.shareMedical })} accessibilityLabel="Toggle auto-transmit">
            <View className={`w-14 h-8 rounded-full px-1 justify-center ${settings.shareMedical ? 'bg-primary items-end' : 'bg-slate-300 items-start'}`}>
              <View className="w-6 h-6 rounded-full bg-white" />
            </View>
          </PressScale>
        </Card>

        {loading && !medical ? (
          <ActivityIndicator color={colors.primary} className="mt-10" />
        ) : !medical ? (
          <Card>
            <EmptyState
              icon={HeartHandshake}
              title="Set up your Medical ID"
              body="Blood group, allergies and conditions help paramedics treat you faster — even if you can't speak."
              action={<Button title="Add medical info" onPress={() => navigation.navigate('MedicalEdit')} />}
            />
          </Card>
        ) : (
          <>
            <SectionLabel>Critical info</SectionLabel>
            <View className="flex-row gap-4 mb-5">
              <Card className="flex-1 p-4" style={{ minHeight: 130 }}>
                <View className="w-9 h-9 rounded-full bg-red-50 items-center justify-center"><Droplet color={colors.red} size={18} fill={colors.red} /></View>
                <Text className="text-4xl font-black text-slate-800 mt-3">{medical.bloodType || '—'}</Text>
                <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Blood type</Text>
              </Card>
              <Card className="flex-1 p-4" style={{ minHeight: 130 }}>
                <View className="w-9 h-9 rounded-full bg-orange-50 items-center justify-center"><AlertTriangle color={colors.primary} size={18} /></View>
                <View className="flex-row flex-wrap gap-1 mt-3 mb-1">
                  {medical.allergies?.length ? medical.allergies.slice(0, 4).map((a) => (
                    <View key={a} className="px-2 py-1 rounded-md bg-red-50"><Text className="text-[10px] font-extrabold text-red-600">{a}</Text></View>
                  )) : <Text className="text-sm font-bold text-slate-500">None known</Text>}
                </View>
                <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Allergies</Text>
              </Card>
            </View>

            <Card className="flex-row items-center gap-4 mb-5 border-l-4 border-l-red-500">
              <Activity color={colors.red} size={24} />
              <View className="flex-1">
                <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Medical conditions</Text>
                <Text className="text-lg font-extrabold text-slate-800">{medical.conditions?.length ? medical.conditions.join(', ') : 'None reported'}</Text>
              </View>
            </Card>

            <Card className="mb-5">
              <View className="flex-row items-center gap-3 mb-3">
                <PillIcon color={colors.blue} size={20} />
                <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Current medications</Text>
              </View>
              <Inset className="p-2">
                {medical.medications?.length ? medical.medications.map((m, i) => (
                  <View key={`${m.name}${i}`} className={`flex-row justify-between items-center py-2.5 px-2 ${i < medical.medications.length - 1 ? 'border-b border-slate-200' : ''}`}>
                    <View className="flex-row items-center gap-3">
                      <View className="w-1.5 h-7 bg-blue-400 rounded-full" />
                      <View>
                        <Text className="font-bold text-slate-700 text-sm">{m.name}</Text>
                        {m.dosage ? <Text className="text-[11px] text-slate-400">{m.dosage}</Text> : null}
                      </View>
                    </View>
                    {m.frequency ? <Text className="text-slate-500 text-[10px] font-extrabold uppercase">{m.frequency}</Text> : null}
                  </View>
                )) : <Text className="text-sm text-slate-400 p-2">No medications listed</Text>}
              </Inset>
            </Card>

            <View className="flex-row gap-4 mb-5">
              <Card className="flex-1 p-4 flex-row items-center gap-3">
                <HeartHandshake color={medical.organDonor ? colors.green : colors.muted} size={20} />
                <View>
                  <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Organ donor</Text>
                  <Text className="text-sm font-extrabold text-slate-700">{medical.organDonor ? 'Yes' : 'No'}</Text>
                </View>
              </Card>
              <Card className="flex-1 p-4 flex-row items-center gap-3">
                <Cake color={colors.primary} size={20} />
                <View>
                  <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Born</Text>
                  <Text className="text-sm font-extrabold text-slate-700">{medical.dateOfBirth || '—'}</Text>
                </View>
              </Card>
            </View>

            {medical.notes ? (
              <Card className="mb-5">
                <Text className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-1">Notes for responders</Text>
                <Text className="text-sm text-slate-700 font-medium leading-5">{medical.notes}</Text>
              </Card>
            ) : null}
          </>
        )}

        <Card onPress={() => navigation.navigate('Contacts')} className="flex-row items-center gap-4 border-l-4 border-l-green-500">
          <Phone color={colors.green} size={24} />
          <View className="flex-1">
            <Text className="text-base font-extrabold text-slate-800">Emergency contacts</Text>
            <Text className="text-xs text-slate-400 font-semibold">Texted automatically with your location</Text>
          </View>
          <ChevronRight color={colors.muted} size={20} />
        </Card>

        <View className="flex-row items-center justify-center gap-1.5 mt-6">
          <Lock color={colors.green} size={12} />
          <Text className="text-[10px] font-bold text-green-700/70 uppercase tracking-wider">AES-256-GCM encrypted at rest</Text>
        </View>
      </ScrollView>

      {/* QR modal */}
      <Modal visible={!!qr} transparent animationType="fade" onRequestClose={() => setQr(null)}>
        <Pressable className="flex-1 bg-black/50 items-center justify-center px-8" onPress={() => setQr(null)}>
          <Pressable className="w-full bg-bg-base rounded-3xl p-6 items-center" style={{ maxWidth: 380 }}>
            <View className="self-end"><PressScale onPress={() => setQr(null)}><X color={colors.muted} size={22} /></PressScale></View>
            <Text className="text-lg font-extrabold text-slate-800">Emergency access scan</Text>
            <Text className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-5">Authorized personnel only</Text>
            {qr?.full ? (
              <>
                <View className="bg-white p-4 rounded-2xl" style={raised(0.6)}>
                  <QRCode value={qr.full} size={200} color="#1e293b" />
                </View>
                <Text className="text-[11px] text-slate-500 text-center mt-4">Scan to view medical ID. Link expires {new Date(qr.expiresAt).toLocaleString()}.</Text>
              </>
            ) : (
              <Text className="text-sm text-red-500 font-bold text-center">{qrErr || 'Could not create a share link.'}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
