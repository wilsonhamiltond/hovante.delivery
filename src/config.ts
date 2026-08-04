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
