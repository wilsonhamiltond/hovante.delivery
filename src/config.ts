import { Platform } from 'react-native';

// Everything configurable about where the app points, read from .env (see that file for what each
// value is and how to override it locally).
//
// The variable is read as a whole `process.env.EXPO_PUBLIC_*` expression on purpose: the Expo CLI
// substitutes that exact text at build time, so destructuring it or indexing process.env would
// leave `undefined` in the bundle. The fallback keeps a checkout with no .env working.
//
// There are no provider credentials here any more. Google and Facebook both run as browser flows
// the API owns end to end, so the client ids and secrets live in its configuration -- the app only
// needs to know which API to open.

// Where the hovante.api lives, including the /api/v1 prefix. On a device or in Expo Go, localhost
// is the phone itself, so EXPO_PUBLIC_API_URL has to name the dev machine's LAN IP or a tunnel.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5179/api/v1';

// Printed once at startup (visible in the Metro terminal) so "which API is this build actually
// calling" is never a guess -- env values are inlined at bundle time and easy to get wrong.
console.log(`[config] API_BASE_URL = ${API_BASE_URL}`);

// Browser key for the Google Maps JavaScript API and Geocoding, used by every map in the app. A
// maps key is public by nature -- it ships inside the page that loads the map -- so it is fine here,
// but it must be locked down in Google Cloud Console (restrict it to the Maps JavaScript and
// Geocoding APIs, and to your app's referrers) or anyone can spend your quota.
//
// One key per platform: a Google key carries exactly one application restriction, so Android, iOS
// and web cannot share one and still be restricted. The names differ rather than the values coming
// from separate EAS environments, because per-platform environments need a Production plan -- with
// the default three (development/preview/production), one environment serves both mobile platforms,
// so the platform has to be encoded in the variable name instead.
//
// Each is spelled out as a whole `process.env.EXPO_PUBLIC_*` expression: the Expo CLI substitutes
// that exact text at build time, so a computed key like process.env['...' + Platform.OS] would
// leave `undefined` in the bundle. The plain EXPO_PUBLIC_GOOGLE_MAPS_API_KEY stays as a fallback so
// a checkout with one shared key -- which is every local .env today -- keeps working.
const MAPS_KEY_BY_PLATFORM: Record<string, string | undefined> = {
  android: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS,
  web: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB,
};

export const GOOGLE_MAPS_API_KEY =
  (MAPS_KEY_BY_PLATFORM[Platform.OS] ?? '').trim()
  || (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();

// Without a key Google renders a dark "for development purposes only" watermark over a dead map, so
// the map components say so plainly instead.
export const MAPS_ENABLED = GOOGLE_MAPS_API_KEY.trim().length > 0;

// The Map ID advanced markers are drawn against (Google Cloud Console → Maps → Map management).
// google.maps.Marker was deprecated in February 2024 in favour of AdvancedMarkerElement, and an
// advanced marker only renders on a map that carries a Map ID -- it is not derivable from the API
// key. Unset, the maps keep using the deprecated marker, which still works and still gets bug
// fixes; set, they switch over. See mapMarkersJs.ts, where both branches live.
export const GOOGLE_MAPS_MAP_ID = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '').trim();
