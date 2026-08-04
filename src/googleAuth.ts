import { Platform } from 'react-native';
import { API_BASE_URL } from './config';

// Sign in with Google, app side -- the same browser flow as Facebook. The app no longer runs a
// native Google request of its own: that needed a client id per platform baked into the build and
// a redirect scheme Expo Go cannot register. Here the API owns the exchange (it holds the client
// secret) and the app only opens a URL and waits for the JWT to come back on the return link.

const APP_DEEP_LINK = 'hovantedelivery://google-auth';

// Which of the API's two configured destinations to come back to. Identical reasoning to the
// Facebook flow: a custom scheme is unreachable on web, and an auth-session popup only completes
// on the origin it started from, so the web build returns to its own /google-auth page.
export const GOOGLE_RETURN_TARGET = Platform.OS === 'web' ? 'web' : 'app';

export const GOOGLE_REDIRECT_URI =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/google-auth`
    : APP_DEEP_LINK;

export const GOOGLE_START_URL =
  `${API_BASE_URL}/auth/google/start?return=${GOOGLE_RETURN_TARGET}`;

export interface GoogleReturn {
  token?: string;
  error?: string;
}

// Reads what the callback put on the return link: `?token=<jwt>` on success, `?error=<message>` on
// every failure. Same hand-rolled parsing as the Facebook return, and for the same reason: `new
// URL()` does not reliably handle a custom scheme on Hermes.
export function parseGoogleReturnUrl(url: string): GoogleReturn {
  const result: GoogleReturn = {};
  const start = url.indexOf('?');
  if (start < 0) return result;

  const hash = url.indexOf('#', start);
  const query = hash < 0 ? url.slice(start + 1) : url.slice(start + 1, hash);

  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    if (key !== 'token' && key !== 'error') continue;

    let value = pair.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Malformed percent-encoding: keep the raw value rather than losing the whole return.
    }
    if (value) result[key] = value;
  }

  return result;
}
