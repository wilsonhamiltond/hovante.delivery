import React, { createContext, useContext, useMemo, useState } from 'react';

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
}

const SessionLocationContext = createContext<SessionLocationState | undefined>(undefined);

export function SessionLocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<SessionLocation | null>(null);

  const value = useMemo<SessionLocationState>(
    () => ({ location, setLocation, clear: () => setLocation(null) }),
    [location],
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

/** What the header pill calls it, so it is obvious this is not one of the saved addresses. */
export const SESSION_LOCATION_LABEL = 'Ubicación actual';
