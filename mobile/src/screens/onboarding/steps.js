import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import {
  ShieldCheck, Siren, Activity, Bot, MapPin, Bell, Smartphone, UserRound, Users, HeartPulse, Check, ChevronRight, Lock,
} from 'lucide-react-native';
import { Text } from '../../components/Text';
import { Button, Card, Field, Inset, PressScale } from '../../components/ui';
import { StepLayout, StepTitle, Chip, TagPicker, ErrorNote, DoneNote, TextLink } from './parts';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { useMedical } from '../../hooks/useMedical';
import { api } from '../../lib/api';
import { COUNTRIES } from '../../lib/dialCodes';
import { checkAllPermissions, requestPermission } from '../../lib/permissions';
import { colors, raised } from '../../theme';

const PHONE_RE = /^[+\d][\d\s-]{5,}$/;

// ---------------------------------------------------------------- 1. Welcome
export function WelcomeStep({ next }) {
  const { user } = useAuth();
  const first = (user?.name || '').split(' ')[0];
  const FEATURES = [
    { icon: Siren, title: 'One-tap SOS', body: 'Alerts responders with your live location and medical ID, and texts your contacts.' },
    { icon: Activity, title: 'Crash & fall detection', body: 'Motion sensors spot a hard impact and start a countdown if you can’t respond.' },
    { icon: Bot, title: 'AI crisis guide', body: 'Calm, step-by-step first aid and safety guidance while help is on the way.' },
  ];
  return (
    <StepLayout footer={<Button title="Get set up" size="lg" icon={ChevronRight} onPress={next} />}>
      <StepTitle
        icon={ShieldCheck}
        eyebrow={first ? `Welcome, ${first}` : 'Welcome to ResQMe'}
        title="Help, the moment you need it."
        body="Two minutes of setup now means responders know who you are, where you are and who to call — even if you can’t tell them."
      />
      <Card className="p-2">
        {FEATURES.map((f, i) => (
          <View key={f.title} className={`flex-row gap-4 px-3 py-4 ${i < FEATURES.length - 1 ? 'border-b border-slate-200/70' : ''}`}>
            <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: `${colors.primary}1a` }}>
              <f.icon color={colors.primary} size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-extrabold text-slate-700">{f.title}</Text>
              <Text className="text-xs text-slate-400 font-medium mt-1 leading-5">{f.body}</Text>
            </View>
          </View>
        ))}
      </Card>
      <View className="flex-row items-center gap-2 mt-5 px-1">
        <Lock color={colors.muted} size={13} />
        <Text className="text-[11px] text-slate-400 font-semibold flex-1">Medical data is encrypted and only shared during an emergency you raise.</Text>
      </View>
    </StepLayout>
  );
}

// ---------------------------------------------------------------- 2. Permissions
const PERMS = [
  { key: 'location', icon: MapPin, title: 'Location', body: 'Sends responders your exact position when you raise an alert.' },
  { key: 'notifications', icon: Bell, title: 'Notifications', body: 'Warns you about crime and severe weather nearby.' },
  { key: 'motion', icon: Smartphone, title: 'Motion sensors', body: 'Powers crash and fall detection in the background.' },
];
const STATUS_LABEL = { granted: 'Allowed', denied: 'Blocked', unavailable: 'Not on this device', undetermined: 'Allow' };

export function PermissionsStep({ next, onChange }) {
  const { retry } = useLocation();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    checkAllPermissions().then((s) => { setStatus(s); onChange?.(s); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (key) => {
    setBusy(key);
    const res = await requestPermission(key);
    if (key === 'location' && res === 'granted') retry?.(); // start the shared GPS watch right away
    setStatus((s) => {
      const nextS = { ...s, [key]: res };
      onChange?.(nextS);
      return nextS;
    });
    setBusy(null);
  };

  const allSet = status && PERMS.every((p) => status[p.key] !== 'undetermined');
  return (
    <StepLayout footer={<Button title={allSet ? 'Continue' : 'Continue for now'} size="lg" icon={ChevronRight} onPress={next} />}>
      <StepTitle title="Let ResQMe look out for you." body="Each permission is used only for your safety. You can change them any time in your phone’s settings." />
      {!status ? (
        <ActivityIndicator color={colors.primary} className="mt-6" />
      ) : (
        <View className="gap-3">
          {PERMS.map((p) => {
            const st = status[p.key];
            const granted = st === 'granted';
            const actionable = st === 'undetermined';
            return (
              <Card key={p.key} className="p-4 flex-row items-center gap-4" depth={0.7}>
                <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${colors.primary}1a` }}>
                  <p.icon color={colors.primary} size={22} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-extrabold text-slate-700">{p.title}</Text>
                  <Text className="text-xs text-slate-400 font-medium mt-0.5 leading-4">{p.body}</Text>
                </View>
                <PressScale onPress={() => ask(p.key)} disabled={!actionable || busy === p.key} accessibilityLabel={`Allow ${p.title}`}>
                  <View
                    className={`h-9 min-w-[76px] px-3 rounded-xl flex-row items-center justify-center gap-1 ${granted ? 'bg-green-600' : actionable ? 'bg-primary' : 'bg-bg-base border border-white'}`}
                    style={actionable || granted ? raised(0.4) : null}
                  >
                    {busy === p.key ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        {granted ? <Check color="#fff" size={14} /> : null}
                        <Text className={`text-[11px] font-extrabold uppercase tracking-wide ${granted || actionable ? 'text-white' : 'text-slate-400'}`}>
                          {STATUS_LABEL[st]}
                        </Text>
                      </>
                    )}
                  </View>
                </PressScale>
              </Card>
            );
          })}
        </View>
      )}
      {status?.location === 'denied' ? (
        <Text className="text-[11px] text-slate-400 font-semibold mt-4 px-1 leading-4">
          Location is blocked. Alerts will use an approximate position — enable it in system settings for accurate help.
        </Text>
      ) : null}
    </StepLayout>
  );
}

// ---------------------------------------------------------------- 3. Profile
export function ProfileStep({ next, skip, onDone }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [country, setCountry] = useState(user?.country || 'IN');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!name.trim()) return setErr('Please enter your name.');
    if (phone.trim() && !PHONE_RE.test(phone.trim())) return setErr('That phone number doesn’t look right.');
    setErr(null);
    setBusy(true);
    await updateProfile({ name: name.trim(), phone: phone.trim() || null, country });
    setBusy(false);
    onDone?.({ phone: !!phone.trim() });
    next();
  };

  return (
    <StepLayout footer={<><Button title="Save & continue" size="lg" loading={busy} onPress={save} /><TextLink title="Skip for now" onPress={skip} /></>}>
      <StepTitle icon={UserRound} title="Who should responders ask for?" body="Your name and number are shared with responders only when you raise an alert." />
      <ErrorNote>{err}</ErrorNote>
      <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" textContentType="name" />
      <Field label="Mobile number" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
      <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 ml-1 mt-1">Where are you based?</Text>
      <View className="flex-row flex-wrap gap-2">
        {Object.entries(COUNTRIES).map(([code, c]) => (
          <Chip key={code} label={`${c.name} · ${c.primary}`} active={country === code} onPress={() => setCountry(code)} />
        ))}
      </View>
      <Text className="text-[11px] text-slate-400 font-semibold mt-3 ml-1">Sets the emergency numbers on your quick-dial.</Text>
    </StepLayout>
  );
}

// ---------------------------------------------------------------- 4. First contact
const RELATIONS = ['Family', 'Partner', 'Friend', 'Doctor', 'Colleague'];

export function ContactStep({ next, skip, onDone }) {
  const [existing, setExisting] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', relation: 'Family' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = () => {
    setLoadErr(null);
    api.contacts()
      .then((list) => { setExisting(list || []); if (list?.length) onDone?.({ contacts: list.length }); })
      .catch((e) => { setExisting([]); setLoadErr(e.message); });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!form.name.trim() || !PHONE_RE.test(form.phone.trim())) return setErr('Enter a name and a valid phone number.');
    setErr(null);
    setBusy(true);
    try {
      await api.addContact({ name: form.name.trim(), phone: form.phone.trim(), relation: form.relation, isPrimary: !existing?.length });
      onDone?.({ contacts: (existing?.length || 0) + 1 });
      next();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const hasSome = existing?.length > 0;
  const formEmpty = !form.name.trim() && !form.phone.trim();
  return (
    <StepLayout
      footer={
        <>
          {hasSome && formEmpty
            ? <Button title="Continue" size="lg" icon={ChevronRight} onPress={next} />
            : <Button title="Add contact" size="lg" loading={busy} onPress={add} />}
          <TextLink title={hasSome ? 'Add later' : 'Skip for now'} onPress={skip} />
        </>
      }
    >
      <StepTitle icon={Users} title="Who should we text if you need help?" body="We send them a message with your live location the moment an alert goes out." />
      {existing === null ? <ActivityIndicator color={colors.primary} className="mb-4" /> : null}
      {hasSome ? (
        <DoneNote>{`${existing.length} contact${existing.length > 1 ? 's' : ''} already set up — ${existing.map((c) => c.name).slice(0, 2).join(', ')}${existing.length > 2 ? '…' : ''}. Add another below or continue.`}</DoneNote>
      ) : null}
      {loadErr ? <ErrorNote>{`Couldn’t load your contacts (${loadErr}).`}</ErrorNote> : null}
      <ErrorNote>{err}</ErrorNote>
      <Field label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Priya Sharma" />
      <Field label="Phone" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+91 98765 43210" keyboardType="phone-pad" />
      <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 ml-1">Relationship</Text>
      <View className="flex-row flex-wrap gap-2">
        {RELATIONS.map((r) => <Chip key={r} label={r} active={form.relation === r} onPress={() => setForm((f) => ({ ...f, relation: r }))} />)}
      </View>
    </StepLayout>
  );
}

// ---------------------------------------------------------------- 5. Medical basics
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const COMMON_ALLERGIES = ['Penicillin', 'Peanuts', 'Latex', 'Aspirin', 'Shellfish'];
const COMMON_CONDITIONS = ['Diabetes', 'Asthma', 'Epilepsy', 'Heart disease', 'Hypertension'];

export function MedicalStep({ next, skip, onDone }) {
  const { medical, loading, save } = useMedical();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Seed the form once the cached / server copy arrives so we never overwrite existing data.
  useEffect(() => {
    if (form || loading) return;
    setForm({ bloodType: medical?.bloodType || 'Unknown', allergies: medical?.allergies || [], conditions: medical?.conditions || [] });
  }, [loading, medical, form]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { updatedAt, ...rest } = medical || {};
      await save({ medications: [], organDonor: false, ...rest, ...form });
      onDone?.({ medical: true });
      next();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepLayout footer={<><Button title="Save medical ID" size="lg" loading={busy} disabled={!form} onPress={submit} /><TextLink title="Skip for now" onPress={skip} /></>}>
      <StepTitle icon={HeartPulse} title="The basics that save time." body="Paramedics see this before they reach you. Add medications and more later from Medical ID." />
      <ErrorNote>{err}</ErrorNote>
      {!form ? (
        <ActivityIndicator color={colors.primary} className="mt-4" />
      ) : (
        <>
          <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 ml-1">Blood type</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {BLOOD.map((b) => <Chip key={b} label={b} active={form.bloodType === b} onPress={() => setForm((f) => ({ ...f, bloodType: b }))} />)}
          </View>
          <TagPicker label="Allergies" values={form.allergies} onChange={(v) => setForm((f) => ({ ...f, allergies: v }))} suggestions={COMMON_ALLERGIES} placeholder="Add another allergy" />
          <TagPicker label="Conditions" values={form.conditions} onChange={(v) => setForm((f) => ({ ...f, conditions: v }))} suggestions={COMMON_CONDITIONS} placeholder="Add another condition" />
        </>
      )}
    </StepLayout>
  );
}

// ---------------------------------------------------------------- 6. Summary
export function DoneStep({ summary, finish, finishing, goTo }) {
  const { user } = useAuth();
  const { medical } = useMedical();
  // Re-check live state so skipped steps still report what is already in place.
  const [perms, setPerms] = useState(summary.permissions || {});
  const [contacts, setContacts] = useState(summary.contacts || 0);
  useEffect(() => {
    checkAllPermissions().then(setPerms).catch(() => {});
    api.contacts().then((l) => setContacts(l?.length || 0)).catch(() => {});
  }, []);
  const rows = [
    { key: 'location', icon: MapPin, title: 'Location access', ok: perms.location === 'granted', step: 1 },
    { key: 'motion', icon: Activity, title: 'Crash detection sensors', ok: perms.motion === 'granted', step: 1, hidden: perms.motion === 'unavailable' },
    { key: 'phone', icon: UserRound, title: 'Your phone number', ok: summary.phone ?? !!user?.phone, step: 2 },
    { key: 'contacts', icon: Users, title: 'Emergency contact', ok: Math.max(contacts, summary.contacts || 0) > 0, step: 3 },
    { key: 'medical', icon: HeartPulse, title: 'Medical ID', ok: !!summary.medical || !!medical, step: 4 },
  ].filter((r) => !r.hidden);
  const done = rows.filter((r) => r.ok).length;
  const all = done === rows.length;
  return (
    <StepLayout footer={<Button title="Enter ResQMe" size="lg" icon={ShieldCheck} loading={finishing} onPress={finish} />}>
      <View className="w-20 h-20 rounded-full bg-green-600 items-center justify-center mb-6" style={raised(0.7)}>
        <ShieldCheck color="#fff" size={38} />
      </View>
      <Text className="text-[11px] font-extrabold uppercase tracking-widest text-green-600 mb-2">{`${done} of ${rows.length} ready`}</Text>
      <Text className="text-[30px] leading-9 font-extrabold text-slate-800">{all ? 'You’re protected.' : 'You’re protected — mostly.'}</Text>
      <Text className="text-[15px] leading-6 text-slate-500 font-medium mt-3 mb-6">
        {all
          ? 'Hold the SOS button any time to alert responders and your contacts.'
          : 'SOS works right now. Finish the rest whenever you like — your Home screen keeps a checklist.'}
      </Text>
      <Inset className="p-0">
        {rows.map((r, i) => (
          <PressScale key={r.key} onPress={r.ok ? undefined : () => goTo(r.step)} disabled={r.ok} accessibilityLabel={r.title}>
            <View className={`flex-row items-center gap-3 py-3.5 px-3 ${i < rows.length - 1 ? 'border-b border-slate-200/70' : ''}`}>
              <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
                <r.icon color={r.ok ? colors.green : colors.muted} size={18} />
              </View>
              <Text className={`text-sm font-bold flex-1 ${r.ok ? 'text-slate-700' : 'text-slate-400'}`}>{r.title}</Text>
              {r.ok ? (
                <View className="w-6 h-6 rounded-full bg-green-600 items-center justify-center"><Check color="#fff" size={14} /></View>
              ) : (
                <Text className="text-[11px] font-extrabold uppercase tracking-wide text-primary">Set up</Text>
              )}
            </View>
          </PressScale>
        ))}
      </Inset>
    </StepLayout>
  );
}
