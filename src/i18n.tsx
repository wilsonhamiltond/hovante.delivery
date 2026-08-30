import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// App UI languages. Spanish is the source language and the default (Dominican market);
// English is offered first, and the Locale union is the only place to grow when more
// languages are added. Catalog content from the API (products, merchant names) is not
// translated here.
//
// No expo-localization on purpose: it is a native module, and adding one would strand the
// existing dev-client/EAS builds. Device detection instead uses Intl (Hermes ships it) with
// navigator.language on web, which needs nothing native.
export type Locale = 'es' | 'en';

export const LOCALES: readonly Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

// Persisted alongside the auth token (see storage.ts for the web/native split rationale).
const LANG_KEY = 'hovante_delivery_lang';

export function parseLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().slice(0, 2);
  return (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
}

function deviceLocale(): Locale {
  try {
    if (Platform.OS === 'web') {
      return parseLocale(globalThis.navigator?.language) ?? DEFAULT_LOCALE;
    }
    return parseLocale(new Intl.DateTimeFormat().resolvedOptions().locale) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function loadSavedLocale(): Promise<Locale | null> {
  try {
    if (Platform.OS === 'web') {
      return parseLocale(globalThis.localStorage?.getItem(LANG_KEY));
    }
    return parseLocale(await SecureStore.getItemAsync(LANG_KEY));
  } catch {
    return null;
  }
}

async function persistLocale(locale: Locale): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(LANG_KEY, locale);
      return;
    }
    await SecureStore.setItemAsync(LANG_KEY, locale);
  } catch {
    // Losing the preference across restarts beats crashing a language switch.
  }
}

// Module-level mirror of the active locale so non-React code (order status labels, push
// routing text, invoice HTML, validation messages) can read it synchronously. Defaults to
// Spanish, which also keeps the Jest suites — which call those helpers without mounting the
// provider — asserting the same strings as before.
let current: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return current;
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Device language answers immediately so the very first frame is already in it; the saved
  // explicit choice arrives async from storage and wins once loaded.
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = deviceLocale();
    current = initial;
    return initial;
  });

  useEffect(() => {
    let active = true;
    loadSavedLocale().then((saved) => {
      if (active && saved) {
        current = saved;
        setLocaleState(saved);
      }
    });
    return () => { active = false; };
  }, []);

  const setLocale = (l: Locale) => {
    current = l;
    setLocaleState(l);
    void persistLocale(l);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

// Per-file string maps: each screen/component declares its own `Record<Locale, …>` (named S
// by convention — `t` is taken by the theme) next to the markup and picks the active one
// here: `const tx = useStrings(S)`.
export function useStrings<T>(map: Record<Locale, T>): T {
  return map[useLocale().locale];
}

// Same lookup for plain modules that cannot use hooks; call at use time (not module load) so
// a language switch is picked up on the next call.
export function strings<T>(map: Record<Locale, T>): T {
  return map[current];
}
