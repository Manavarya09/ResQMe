import { Share, Platform } from 'react-native';
import { mapsLink } from './geo';
import { formatUntil } from './liveShare';

// Builds the text shared by "Share live location". With a `liveUrl` (a ResQMe /t/<token> link) the
// recipient gets a page that keeps updating; otherwise it falls back to a one-off maps link.
export function buildShareMessage(location, { name, liveUrl, expiresAt, untilStopped } = {}) {
  const who = name ? `${name} is` : "I'm";
  if (liveUrl) {
    const until = expiresAt && !untilStopped ? ` until ${formatUntil(expiresAt)}` : '';
    return {
      title: 'My live location',
      url: liveUrl,
      message: `${who} sharing a live location with you via ResQMe${until}. Follow along here: ${liveUrl}`,
    };
  }
  const acc = Number.isFinite(location?.accuracy) ? ` (accurate to ~${Math.round(location.accuracy)} m)` : '';
  const url = mapsLink(location);
  return {
    title: 'My location',
    url,
    message: `${who} sharing a location with you via ResQMe${acc}: ${url}`,
  };
}

// Opens the OS share sheet. Resolves to true if the user shared (or 'copied' for the web fallback).
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
