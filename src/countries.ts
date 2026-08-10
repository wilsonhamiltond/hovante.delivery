import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

// The country list for the phone field, built from libphonenumber-js rather than hand-written: it
// already ships every calling code, and a hand-kept list of 245 entries would drift the first time
// one changed.

export interface Country {
  iso: CountryCode;
  /** Calling code without the plus, e.g. "1", "34". */
  dial: string;
  /** Regional-indicator flag, derived from the ISO code -- no lookup table needed. */
  flag: string;
  /** Localised country name, or the ISO code where the runtime cannot supply one. */
  name: string;
}

/** Where the app is: the phone field opens here, and a number typed with no country is read as this. */
export const DEFAULT_COUNTRY: CountryCode = 'DO';

// A two-letter ISO code maps to its flag by offsetting each letter into the regional-indicator
// block. Every flag emoji is that pair, so this needs no data of its own.
const flagOf = (iso: string): string =>
  iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

// Country names come from the runtime when it has them. Hermes ships a reduced Intl, so this is
// guarded rather than assumed: without it the picker still works, showing the ISO code and the
// calling code, which are what people actually scan for.
const displayNames = (() => {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: object) => { of(c: string): string | undefined } }).DisplayNames;
    return DN ? new DN(['es', 'en'], { type: 'region' }) : null;
  } catch {
    return null;
  }
})();

const nameOf = (iso: string): string => {
  try {
    return displayNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
};

/** Every country, sorted by name so the picker reads alphabetically. */
export const COUNTRIES: Country[] = getCountries()
  .map((iso) => ({ iso, dial: getCountryCallingCode(iso), flag: flagOf(iso), name: nameOf(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const countryByIso = (iso: CountryCode): Country =>
  COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];

/** Matches on name, ISO code or calling code, so "+34", "ES" and "España" all find Spain. */
export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  if (!q) return COUNTRIES;
  return COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q || c.dial.startsWith(q));
}
