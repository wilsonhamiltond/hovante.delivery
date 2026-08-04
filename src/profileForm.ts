import * as Location from 'expo-location';

// The pieces the sign-up wizard and the social profile-completion form both need. They ask for the
// same person info and the same location; only how the account is created differs (a password and
// an emailed code, or a provider that already proved the email).

// What the saved address gets called. The first two are one tap; "Otro" opens a free-text box so
// the label is still the customer's own words.
export const LABEL_CHOICES = ['Casa', 'Trabajo', 'Otro'] as const;
export type LabelChoice = (typeof LABEL_CHOICES)[number];

// Turns typed digits into DD/MM/AAAA as you go, so no date-picker dependency is needed.
export const maskDate = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
};

// DD/MM/AAAA -> yyyy-MM-dd, or null when it is not a real past date.
export const toIsoDate = (masked: string): string | null => {
  const m = masked.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = +dd, month = +mm, year = +yyyy;
  const d = new Date(year, month - 1, day);
  const real = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  if (!real || d >= new Date()) return null;
  return `${yyyy}-${mm}-${dd}`;
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
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'permission' };

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    let address: string | null = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`);
      const j = await r.json();
      if (j && j.display_name) address = j.display_name;
    } catch {
      // Keep the pin: the caller leaves whatever address is already typed in place.
    }

    return { ok: true, location: { lat, lng, address } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
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
