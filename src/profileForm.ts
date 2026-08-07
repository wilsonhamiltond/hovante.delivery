import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { GOOGLE_MAPS_API_KEY, MAPS_ENABLED } from './config';

/**
 * Turns a pin into a readable address with the Google Geocoding API -- the same service the maps
 * themselves use, so an address typed here matches one picked off the map instead of coming from a
 * different gazetteer with different street names.
 *
 * Null on any failure (no key, no network, no result): the caller keeps whatever address is already
 * in the box, which is better than blanking it because a lookup did not answer.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!MAPS_ENABLED) return null;
  try {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json'
      + `?latlng=${lat},${lng}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json?.status === 'OK' && json.results?.[0]?.formatted_address) {
      return json.results[0].formatted_address as string;
    }
  } catch {
    // Fall through: a failed lookup must not cost the caller the pin it already has.
  }
  return null;
}

// The pieces the sign-up wizard and the social profile-completion form both need. They ask for the
// same person info and the same location; only how the account is created differs (a password and
// an emailed code, or a provider that already proved the email).

// What the saved address gets called. The first two are one tap; "Otro" opens a free-text box so
// the label is still the customer's own words.
export const LABEL_CHOICES = ['Casa', 'Trabajo', 'Otro'] as const;
export type LabelChoice = (typeof LABEL_CHOICES)[number];

// The only shape the phone field accepts. Shown as the placeholder and quoted back in the error, so
// the rule is stated in one place rather than three.
export const PHONE_MASK = '(000) 000-0000';
// Ten: a Dominican number is a three-digit area code (809/829/849) plus seven.
const PHONE_DIGITS = 10;

/**
 * Formats whatever was typed into (000) 000-0000, keeping only digits and stopping at ten.
 *
 * Rebuilt from the digits on every keystroke rather than by inserting separators at fixed offsets,
 * so typing, pasting a number that already has punctuation, and deleting all land in the same
 * shape. Anything that is not a digit -- spaces, dashes, a leading +1 -- is simply dropped.
 */
export const maskPhone = (raw: string): string => {
  const digits = (raw ?? '').replace(/\D/g, '').slice(0, PHONE_DIGITS);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

/** Whether the field holds a whole number, not a half-typed one. */
export const isCompletePhone = (masked: string): boolean =>
  (masked ?? '').replace(/\D/g, '').length === PHONE_DIGITS;

export interface DetectedLocation {
  lat: number;
  lng: number;
  // Reverse-geocoded street address, or null when that lookup failed -- the pin is still good.
  address: string | null;
}

export type DetectResult =
  | { ok: true; location: DetectedLocation }
  | { ok: false; reason: 'permission' | 'failed' };

// Drops the pin on the device's current position and names it, the same way checkout does. Returns
// why it could not rather than alerting, so each screen words it in its own voice.
export async function detectCurrentLocation(): Promise<DetectResult> {
  try {
    // Asking first is right on native, where this is what shows the system dialog. On WEB it only
    // reads the Permissions API -- the browser prompts when the position is actually requested --
    // so a first-time visitor sits at "prompt", which is not "granted". Bailing here would refuse
    // before the browser ever had the chance to ask, and the button could never succeed.
    if (Platform.OS !== 'web') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { ok: false, reason: 'permission' };
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    return { ok: true, location: { lat, lng, address: await reverseGeocode(lat, lng) } };
  } catch (error) {
    // On web the refusal surfaces here instead, as a rejected position request. Worth separating:
    // "turn the permission on" is a different instruction from "we could not get a fix".
    return { ok: false, reason: isPermissionDenied(error) ? 'permission' : 'failed' };
  }
}

// GeolocationPositionError.PERMISSION_DENIED is 1; expo-location wraps native denials in a message
// rather than that code, so both are checked.
function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 1 || code === 'E_NO_PERMISSIONS') return true;
  const message = (error as { message?: string })?.message ?? '';
  return /denied|permission/i.test(message);
}

// Facebook and Google hand back one display name ("Ana María Pérez"), but the account stores a name
// and a surname separately. Split on the first space so the form opens pre-filled and the person
// only corrects it -- everything after the first word is the surname, which is right far more often
// than the reverse for the Spanish names this app serves.
export function splitDisplayName(full: string | null): { name: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: '', lastName: '' };
  if (parts.length === 1) return { name: parts[0], lastName: '' };
  return { name: parts[0], lastName: parts.slice(1).join(' ') };
}
