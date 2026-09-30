import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

export const SOUNDS = {
  siren: require('../../assets/sounds/siren.wav'),
  ringtone: require('../../assets/sounds/ringtone.wav'),
};

// Plays a looping sound at full volume, ignoring the iOS silent switch. Returns a stop() function.
// Never throws: on platforms without audio (or if autoplay is blocked on web) it silently no-ops.
export async function playLoop(source, { volume = 1, exclusive = true } = {}) {
  let player = null;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: exclusive ? 'doNotMix' : 'duckOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
    player = createAudioPlayer(source);
    player.loop = true;
    player.volume = volume;
    player.play();
  } catch {
    // audio unavailable — visual/vibration cues still work
  }
  let stopped = false;
  return () => {
    if (stopped || !player) return;
    stopped = true;
    try {
      player.pause();
      player.remove();
    } catch {}
  };
}
