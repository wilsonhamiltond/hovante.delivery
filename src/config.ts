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
// Geocoding APIs, and to your app's referrers/bundle ids) or anyone can spend your quota.
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// Without a key Google renders a dark "for development purposes only" watermark over a dead map, so
// the map components say so plainly instead.
export const MAPS_ENABLED = GOOGLE_MAPS_API_KEY.trim().length > 0;
