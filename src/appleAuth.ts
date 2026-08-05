import { Platform } from 'react-native';
import { API_BASE_URL } from './config';

// Sign in with Apple, app side -- the same browser flow as Google and Facebook. Apple's extra
// requirements (an ES256 client secret signed per request, an HTTPS-only return URL, a form POST
// back) all land on the API; from here it is the same two steps: open a URL, read the JWT off the
// link that comes back.

const APP_DEEP_LINK = 'hovantedelivery://apple-auth';

export const APPLE_RETURN_TARGET = Platform.OS === 'web' ? 'web' : 'app';

export const APPLE_REDIRECT_URI =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/apple-auth`
    : APP_DEEP_LINK;

export const APPLE_START_URL =
  `${API_BASE_URL}/auth/apple/start?return=${APPLE_RETURN_TARGET}`;

export interface AppleReturn {
  token?: string;
  error?: string;
}

// Reads what the callback put on the return link: `?token=<jwt>` on success, `?error=<message>` on
// every failure. Same hand-rolled parsing as the other two providers, and for the same reason:
// `new URL()` does not reliably handle a custom scheme on Hermes.
export function parseAppleReturnUrl(url: string): AppleReturn {
  const result: AppleReturn = {};
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
