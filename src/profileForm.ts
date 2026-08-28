import { Platform } from 'react-native';
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { DEFAULT_COUNTRY } from './countries';
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

/**
 * The mirror image: turns a TYPED address into a pin, with the same Geocoding API so the result
 * matches what picking off the map would have named. Biased to the Dominican Republic
 * (components=country:DO) so "Calle Duarte 12" finds the local one, not a namesake abroad.
 *
 * Null on any failure (no key, no network, nothing found): the caller keeps the pin and the text
 * it already has, and says "not found" in its own words.
 */
export async function forwardGeocode(query: string): Promise<{ lat: number; lng: number; address: string | null } | null> {
  if (!MAPS_ENABLED) return null;
  const q = query.trim();
  if (!q) return null;
  try {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json'
      + `?address=${encodeURIComponent(q)}&components=country:DO&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    const res = await fetch(url);
    const json = await res.json();
    const hit = json?.status === 'OK' ? json.results?.[0] : null;
    const loc = hit?.geometry?.location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng, address: (hit.formatted_address as string) ?? null };
    }
  } catch {
    // Fall through, same as above.
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

// Phone numbers are country-aware: the field is a country picker plus a national number, and what
// gets stored is E.164 (+18095550100). libphonenumber-js owns the per-country rules -- how many
// digits a Spanish mobile has, how a Dominican number groups -- so none of that is hard-coded here.

/**
 * Formats the national part as it is typed, in that country's own convention: (809) 555-0100 for
 * the Dominican Republic, 612 34 56 78 for Spain. Rebuilt from scratch on every keystroke, so
 * typing, pasting a punctuated number and deleting all land in the same shape.
 */
export const maskPhone = (raw: string, country: CountryCode = DEFAULT_COUNTRY): string => {
  // 15 is E.164's hard ceiling for country code plus national number, so nothing longer can be a
  // phone number anywhere. Without a cap the field silently accepts digit soup, which AsYouType
  // then hands back unformatted -- looking broken rather than rejected.
  const digits = (raw ?? '').replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  return new AsYouType(country).input(digits);
};

/** Whether the field holds a real number for that country, not a half-typed one. */
export const isCompletePhone = (national: string, country: CountryCode = DEFAULT_COUNTRY): boolean => {
  const digits = (national ?? '').replace(/\D/g, '');
  if (!digits) return false;
  const parsed = parsePhoneNumberFromString(digits, country);
  return !!parsed?.isValid();
};

/** The stored form: +<country><national>, or '' when the number is not usable. */
export const toE164 = (national: string, country: CountryCode = DEFAULT_COUNTRY): string => {
  const digits = (national ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const parsed = parsePhoneNumberFromString(digits, country);
  return parsed?.isValid() ? parsed.number : '';
};

/**
 * Splits a stored number back into a country and its national part, for editing.
 *
 * Falls back to DEFAULT_COUNTRY for anything that predates the country picker -- the app stored
 * bare Dominican numbers like "(809) 555-0100" before it existed, and those must keep working.
 */
export const parsePhone = (value: string | null): { country: CountryCode; national: string } => {
  const raw = (value ?? '').trim();
  if (!raw) return { country: DEFAULT_COUNTRY, national: '' };
  const parsed = parsePhoneNumberFromString(raw, raw.startsWith('+') ? undefined : DEFAULT_COUNTRY);
  if (!parsed) return { country: DEFAULT_COUNTRY, national: raw.replace(/\D/g, '') };
  return {
    country: (parsed.country ?? DEFAULT_COUNTRY) as CountryCode,
    national: maskPhone(parsed.nationalNumber, (parsed.country ?? DEFAULT_COUNTRY) as CountryCode),
  };
};

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
