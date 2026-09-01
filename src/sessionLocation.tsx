import React, { createContext, useContext, useMemo, useState } from 'react';
import { strings, type Locale } from './i18n';

// Where the customer is *right now*, as opposed to where they usually are.
//
// Deliberately in memory only: this is "deliver here today", not a change of address. It never
// touches the saved address book, so a courier sent to a friend's house this evening does not
// silently repoint the account's default for every order afterwards. Closing the app forgets it and
// the saved default takes over again -- which is the behaviour someone expects of a one-off.

export interface SessionLocation {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface SessionLocationState {
  location: SessionLocation | null;
  setLocation: (location: SessionLocation) => void;
  clear: () => void;
  /**
   * Whether the app has already tried to read the phone's position this session. The home detects
   * on entry, and this is what keeps that to ONCE: it survives the screen being remounted, and it
   * stays true after clear(), so a customer who deliberately picks a saved address is not quietly
   * moved back to where they are standing the next time the home mounts.
   */
  attempted: boolean;
  markAttempted: () => void;
}

const SessionLocationContext = createContext<SessionLocationState | undefined>(undefined);

export function SessionLocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<SessionLocation | null>(null);
  const [attempted, setAttempted] = useState(false);

  const value = useMemo<SessionLocationState>(
    () => ({
      location,
      setLocation,
      clear: () => setLocation(null),
      attempted,
      markAttempted: () => setAttempted(true),
    }),
    [location, attempted],
  );

  return (
    <SessionLocationContext.Provider value={value}>
      {children}
    </SessionLocationContext.Provider>
  );
}

export function useSessionLocation(): SessionLocationState {
  const ctx = useContext(SessionLocationContext);
  if (!ctx) throw new Error('useSessionLocation must be used within SessionLocationProvider');
  return ctx;
}

const S: Record<Locale, { sessionLocationLabel: string }> = {
  es: { sessionLocationLabel: 'Ubicación actual' },
  en: { sessionLocationLabel: 'Current location' },
  fr: { sessionLocationLabel: 'Position actuelle' },
};

/** What the header pill calls it, so it is obvious this is not one of the saved addresses. */
export function sessionLocationLabel(): string {
  return strings(S).sessionLocationLabel;
}
