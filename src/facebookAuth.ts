import { Platform } from 'react-native';
import { API_BASE_URL } from './config';

// Sign in with Facebook, app side. Facebook cannot hand the app a token the way Google does: its
// OAuth dialog only redirects to an HTTPS URL registered in Meta's console, and swapping the code
// needs the app secret. So the API owns the whole flow -- the app just opens /auth/facebook/start
// in the phone's browser and waits for the deep link back carrying our JWT (or an error message).

// The API only ever redirects to one of two destinations it has configured -- the target is a name
// in its signed state, never a URL we send -- so the app cannot ask for an arbitrary return page:
//   app (Facebook:AppLinkBase) -> the deep link below, whose scheme is app.json's `scheme`. That is
//                                 what registers it with the OS, so it resolves in a real build
//                                 (not Expo Go).
//   web (Facebook:WebLinkBase) -> this same /facebook-auth screen served by the web build. On web a
//                                 custom scheme is unreachable, and openAuthSessionAsync's popup
//                                 only completes on the origin it started from, so the return page
//                                 has to be our own origin.
const APP_DEEP_LINK = 'hovantedelivery://facebook-auth';

export const FACEBOOK_RETURN_TARGET = Platform.OS === 'web' ? 'web' : 'app';

export const FACEBOOK_REDIRECT_URI =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/facebook-auth`
    : APP_DEEP_LINK;

export const FACEBOOK_START_URL =
  `${API_BASE_URL}/auth/facebook/start?return=${FACEBOOK_RETURN_TARGET}`;

export interface FacebookReturn {
  token?: string;
  error?: string;
}

// Reads what the callback put on the deep link: `?token=<jwt>` on success, `?error=<message>` on
// every failure. Parsed by hand rather than with `new URL()`, which does not reliably handle a
// custom scheme on Hermes, and kept pure so the contract can be unit-tested without a browser.
export function parseFacebookReturnUrl(url: string): FacebookReturn {
  const result: FacebookReturn = {};
  const start = url.indexOf('?');
  if (start < 0) return result;

  // Drop a trailing fragment: it is never part of the query.
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
      // Malformed percent-encoding: keep the raw value rather than throwing away the whole return.
    }
    if (value) result[key] = value;
  }

  return result;
}
