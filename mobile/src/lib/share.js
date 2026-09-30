import { Share, Platform } from 'react-native';
import { mapsLink } from './geo';

// Builds the text shared by "Share my location". Swap point: when live-tracking links exist,
// replace the body (or accept a `liveUrl` option) — callers only depend on this signature.
export function buildShareMessage(location, { name } = {}) {
  const who = name ? `${name} is` : "I'm";
  const acc = Number.isFinite(location?.accuracy) ? ` (accurate to ~${Math.round(location.accuracy)} m)` : '';
  const url = mapsLink(location);
  return {
    title: 'My location',
    url,
    message: `${who} sharing a location with you via ResQMe${acc}: ${url}`,
  };
}

// Opens the OS share sheet. Resolves to true if the user shared (or the web fallback copied it).
export async function shareLocation(location, opts) {
  const { title, url, message } = buildShareMessage(location, opts);
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text: message, url });
        return true;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        return 'copied';
      }
    } catch {
      return false;
    }
    return false;
  }
  // `message` already contains the link (Android ignores `url`; on iOS passing both duplicates it).
  const res = await Share.share({ message, title }, { dialogTitle: 'Share my location', subject: title });
  return res.action === Share.sharedAction;
}
