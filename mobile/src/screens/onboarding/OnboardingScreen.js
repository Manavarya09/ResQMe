import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../../components/Text';
import { Screen, IconButton, PressScale } from '../../components/ui';
import { ProgressBar } from './parts';
import { WelcomeStep, PermissionsStep, ProfileStep, ContactStep, MedicalStep, DoneStep } from './steps';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme';

const STEPS = [WelcomeStep, PermissionsStep, ProfileStep, ContactStep, MedicalStep, DoneStep];
const pad = (n) => String(n).padStart(2, '0');

// First-run setup, shown once per account (until settings.onboarded is true). Every step can be
// skipped; finishing (or skipping to the end) marks the account as onboarded.
export default function OnboardingScreen() {
  const { updateSettings } = useAuth();
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState({});
  const [finishing, setFinishing] = useState(false);

  const last = STEPS.length - 1;
  const next = useCallback(() => setIndex((i) => Math.min(last, i + 1)), [last]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const merge = useCallback((patch) => setSummary((s) => ({ ...s, ...patch })), []);

  const finish = async () => {
    setFinishing(true);
    await updateSettings({ onboarded: true, onboardedAt: new Date().toISOString() });
    // Navigation swaps to the main tabs once settings.onboarded flips; nothing else to do here.
  };

  const Step = STEPS[index];
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1 h-14">
        <View style={{ width: 40 }}>
          {index > 0 && index < last ? (
            <IconButton onPress={back} accessibilityLabel="Previous step">
              <ChevronLeft color={colors.sub} size={22} />
            </IconButton>
          ) : null}
        </View>
        <ProgressBar total={STEPS.length} index={index} />
        <Text className="text-xs font-bold text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>
          {`Step ${index + 1} of ${STEPS.length}`}
        </Text>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>
          {index < last ? (
            <PressScale onPress={() => setIndex(last)} accessibilityLabel="Skip setup">
              <Text className="text-xs font-extrabold uppercase tracking-wide text-primary">Skip</Text>
            </PressScale>
          ) : null}
        </View>
      </View>
      <Step
        key={index}
        next={next}
        skip={next}
        onChange={(permissions) => merge({ permissions })}
        onDone={merge}
        summary={summary}
        finish={finish}
        finishing={finishing}
        goTo={setIndex}
      />
    </Screen>
  );
}
