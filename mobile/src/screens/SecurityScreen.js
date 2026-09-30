import React, { useEffect, useState } from 'react';
import { View, ScrollView, Platform, Share, Alert } from 'react-native';
import Text from '../components/Text';
import QRCode from 'react-native-qrcode-svg';
import { KeyRound, ShieldCheck, ShieldOff, LogOut, Download, Trash2, History, Copy } from 'lucide-react-native';
import { Screen, Header, Card, Field, Button, SectionLabel, Pill, Inset } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors } from '../theme';

const ACTION_LABEL = {
  login: 'Signed in', login_failed: 'Failed sign-in', mfa_enabled: '2FA enabled', mfa_disabled: '2FA disabled',
  password_changed: 'Password changed', logout_all: 'Signed out everywhere', medical_updated: 'Medical ID updated',
  medical_viewed: 'Medical ID viewed via QR', incident_created: 'Emergency raised', incident_acknowledged: 'Responder acknowledged',
  incident_resolved: 'Emergency resolved', incident_cancelled: 'Emergency cancelled',
};

export default function SecurityScreen({ navigation }) {
  const { user, logout, replaceSession, refreshUser } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl }
  const [recovery, setRecovery] = useState(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [delPw, setDelPw] = useState('');
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.audit().then((a) => setAudit(Array.isArray(a) ? a : a?.items || [])).catch(() => {});
  }, [user?.mfaEnabled]);

  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ error: true, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const startSetup = () => run('setup', async () => setSetup(await api.mfaSetup()));
  const enable = () => run('enable', async () => {
    const r = await api.mfaEnable(code.trim());
    setRecovery(r.recoveryCodes);
    setSetup(null);
    setCode('');
    await refreshUser();
  });
  const disable = () => run('disable', async () => {
    await api.mfaDisable(code.trim());
    setCode('');
    await refreshUser();
    setMsg({ text: 'Two-factor authentication turned off.' });
  });
  const changePw = () => run('pw', async () => {
    if (pw.next.length < 8) throw new Error('New password must be at least 8 characters.');
    const r = await api.changePassword({ currentPassword: pw.current, newPassword: pw.next });
    await replaceSession(r.token, r.user);
    setPw({ current: '', next: '' });
    setMsg({ text: 'Password changed. Other devices were signed out.' });
  });
  const logoutAll = () => run('all', async () => {
    await api.logoutAll();
    await logout();
  });
  const exportData = () => run('export', async () => {
    const data = await api.exportData();
    const json = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `resqme-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } else {
      await Share.share({ title: 'ResQMe data export', message: json });
    }
    setMsg({ text: 'Your data export is ready.' });
  });
  const deleteAccount = () => {
    const go = () => run('delete', async () => {
      await api.deleteAccount(delPw);
      await logout();
    });
    if (Platform.OS === 'web') return go();
    Alert.alert('Delete account?', 'This permanently deletes your profile, medical ID, contacts and history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Security & privacy" subtitle="Two-factor, sessions and your data" onBack={() => navigation.goBack()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {msg ? (
          <View className={`rounded-xl px-4 py-3 mb-2 ${msg.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
            <Text className={`text-xs font-bold ${msg.error ? 'text-red-600' : 'text-green-700'}`}>{msg.text}</Text>
          </View>
        ) : null}

        <SectionLabel>Two-factor authentication</SectionLabel>
        <Card>
          <View className="flex-row items-center gap-3 mb-3">
            {user?.mfaEnabled ? <ShieldCheck color={colors.green} size={24} /> : <KeyRound color={colors.primary} size={24} />}
            <View className="flex-1">
              <Text className="text-base font-extrabold text-slate-800">Authenticator app</Text>
              <Text className="text-[11px] text-slate-400 font-semibold">Google Authenticator, Authy, 1Password…</Text>
            </View>
            <Pill label={user?.mfaEnabled ? 'On' : 'Off'} color={user?.mfaEnabled ? colors.green : colors.muted} />
          </View>

          {recovery ? (
            <>
              <Text className="text-sm font-bold text-slate-700 mb-2">Save these recovery codes somewhere safe. Each works once.</Text>
              <Inset className="flex-row flex-wrap gap-2 mb-3">
                {recovery.map((c) => (
                  <Text key={c} className="text-sm font-bold text-slate-700 w-[46%]" style={{ fontVariant: ['tabular-nums'], letterSpacing: 0.5 }}>{c}</Text>
                ))}
              </Inset>
              <Button title="I've saved them" icon={Copy} variant="ghost" onPress={() => setRecovery(null)} />
            </>
          ) : setup ? (
            <>
              <Text className="text-sm text-slate-600 font-semibold mb-3">Scan with your authenticator app, then enter the 6-digit code.</Text>
              <View className="items-center mb-3">
                <View className="bg-white p-3 rounded-2xl"><QRCode value={setup.otpauthUrl} size={170} /></View>
                <Text selectable className="text-[11px] font-bold text-slate-500 mt-2" style={{ letterSpacing: 1 }}>{setup.secret}</Text>
              </View>
              <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" />
              <Button title="Turn on 2FA" onPress={enable} loading={busy === 'enable'} disabled={code.trim().length < 6} />
            </>
          ) : user?.mfaEnabled ? (
            <>
              <Field label="Code to turn off" value={code} onChangeText={setCode} placeholder="6-digit or recovery code" autoCapitalize="none" />
              <Button title="Turn off 2FA" icon={ShieldOff} variant="ghost" onPress={disable} loading={busy === 'disable'} disabled={code.trim().length < 6} />
            </>
          ) : (
            <Button title="Set up 2FA" icon={KeyRound} onPress={startSetup} loading={busy === 'setup'} />
          )}
        </Card>

        <SectionLabel>Password</SectionLabel>
        <Card>
          <Field label="Current password" value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} secureTextEntry />
          <Field label="New password" value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} secureTextEntry />
          <Button title="Change password" onPress={changePw} loading={busy === 'pw'} disabled={!pw.current || !pw.next} />
        </Card>

        <SectionLabel>Sessions & data</SectionLabel>
        <View className="gap-3">
          <Button title="Sign out all devices" icon={LogOut} variant="ghost" onPress={logoutAll} loading={busy === 'all'} />
          <Button title="Download my data" icon={Download} variant="ghost" onPress={exportData} loading={busy === 'export'} />
        </View>

        <SectionLabel>Recent account activity</SectionLabel>
        <Card className="p-4">
          {audit.length ? audit.slice(0, 12).map((a) => (
            <View key={a.id} className="flex-row items-center gap-3 py-1.5">
              <History color={colors.muted} size={14} />
              <Text className="text-xs font-bold text-slate-600 flex-1">{ACTION_LABEL[a.action] || a.action}</Text>
              <Text className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</Text>
            </View>
          )) : <Text className="text-xs text-slate-400">No activity yet.</Text>}
        </Card>

        <SectionLabel>Danger zone</SectionLabel>
        <Card>
          <Field label="Confirm with password" value={delPw} onChangeText={setDelPw} secureTextEntry />
          <Button title="Delete my account" icon={Trash2} variant="danger" onPress={deleteAccount} loading={busy === 'delete'} disabled={!delPw} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
