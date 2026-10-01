import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as api from './api';
import { useAuth } from './auth';
import { currentPosition } from './position';
import {
  beat, resetBeat, startBackgroundTracking, stopBackgroundTracking, type TrackingMode,
} from './driverBackground';

// The driver's online toggle, app-wide: the state lives here rather than on the home screen because
// the heartbeat has to keep going while the driver is on any screen -- a delivery's detail, the
// route, their account -- not just the map.

// The foreground beat. Well inside the server's timeout (10 min) so a couple of lost requests on a
// weak signal never cost the driver their shift.
const FOREGROUND_BEAT_MS = 60000;

interface DriverPresenceValue {
  /** Null until loaded, and for good for anyone who is not a driver. */
  presence: api.DriverPresence | null;
  /** The shift is open -- the toggle is on. */
  online: boolean;
  /** On, but the server has not heard a beat within its timeout: the driver is not being counted
   * as available until one gets through (no signal, or the app was away for a while). */
  stale: boolean;
  /** How the current shift is tracked; null while offline. */
  mode: TrackingMode | null;
  busy: boolean;
  /** Resolve to an error message, or null on success. NO_LOCATION when no fix could be taken. */
  goOnline: () => Promise<string | null>;
  goOffline: () => Promise<string | null>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<DriverPresenceValue | null>(null);

export const NO_LOCATION = 'NO_LOCATION';

const NOT_A_DRIVER: DriverPresenceValue = {
  presence: null,
  online: false,
  stale: false,
  mode: null,
  busy: false,
  goOnline: async () => null,
  goOffline: async () => null,
  refresh: async () => {},
};

export function useDriverPresence(): DriverPresenceValue {
  return useContext(Ctx) ?? NOT_A_DRIVER;
}

// The shift as stored is still open, whatever the effective state says. A driver who closed the app
// for a quarter of an hour mid-delivery is stored online but no longer effectively so; one beat
// brings them back, whereas a shift ended by the toggle or the timeout carries a reason and stays
// ended until the driver turns it on again.
const shiftOpen = (p: api.DriverPresence | null) => p != null && p.onlineSince != null && p.offlineReason == null;

async function lastFix(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS !== 'web') {
    try {
      const known = await Location.getLastKnownPositionAsync({ maxAge: FOREGROUND_BEAT_MS * 2 });
      if (known) return { lat: known.coords.latitude, lng: known.coords.longitude };
    } catch {
      // Fall through to a fresh fix.
    }
  }
  return currentPosition();
}

export function DriverPresenceProvider({ children }: { children: ReactNode }) {
  const { token, profileComplete } = useAuth();
  const [isDriver, setIsDriver] = useState(false);
  const [presence, setPresence] = useState<api.DriverPresence | null>(null);
  const [mode, setMode] = useState<TrackingMode | null>(null);
  const [busy, setBusy] = useState(false);
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  // Every answer from the server lands here, so whichever path learns the shift ended -- a refresh,
  // a beat, the toggle -- also stops the background reporting.
  const adopt = useCallback((p: api.DriverPresence) => {
    setPresence(p);
    if (!p.isOnline && !shiftOpen(p)) {
      setMode(null);
      void stopBackgroundTracking();
    }
  }, []);

  // Who is signed in decides whether any of this runs. The profile is already cached by the time
  // the session is complete (AuthProvider fetched it), so this rarely costs a request.
  useEffect(() => {
    let active = true;
    if (!token || profileComplete !== true) {
      setIsDriver(false);
      setPresence(null);
      setMode(null);
      return;
    }
    (async () => {
      const me = api.cachedMe() ?? (await api.me()).data;
      if (active) setIsDriver(me?.isDriver === true);
    })();
    return () => { active = false; };
  }, [token, profileComplete]);

  const refresh = useCallback(async () => {
    const res = await api.driverPresence();
    if (!res.success || !res.data) return;
    let p = res.data;
    if (shiftOpen(p)) {
      // Back from a quiet spell (app reopened, phone restarted): beat now rather than in a minute,
      // and make sure the background reporting is running again -- the OS may have dropped it.
      const at = await lastFix();
      if (at) p = (await beat(at.lat, at.lng, true)) ?? p;
      if (shiftOpen(p)) setMode(await startBackgroundTracking());
    }
    adopt(p);
  }, [adopt]);

  useEffect(() => {
    if (isDriver) void refresh();
  }, [isDriver, refresh]);

  // Back to the foreground: the shift may have been ended while the app was away (the "te
  // desconectamos" push), and the toggle must say so the moment the driver looks.
  useEffect(() => {
    if (!isDriver) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [isDriver, refresh]);

  // The foreground beat. Covers the driver who refused the "always" permission, and keeps a driver
  // standing still beating even where the OS task is sparse.
  const online = isDriver && shiftOpen(presence);
  useEffect(() => {
    if (!online) return;
    const timer = setInterval(async () => {
      if (AppState.currentState !== 'active') return;
      const at = await lastFix();
      if (!at) return;
      const p = await beat(at.lat, at.lng);
      if (p) adopt(p);
    }, FOREGROUND_BEAT_MS);
    return () => clearInterval(timer);
  }, [online, adopt]);

  const goOnline = useCallback(async () => {
    setBusy(true);
    try {
      // A position is required: an online driver nobody can place on the map would be counted
      // nowhere, and the toggle would look on while the driver received nothing.
      const at = await currentPosition();
      if (!at) return NO_LOCATION;
      const res = await api.setDriverPresence(true, at);
      if (!res.success || !res.data) return res.message || 'No se pudo poner en línea.';
      resetBeat();
      adopt(res.data);
      setMode(await startBackgroundTracking(true));
      return null;
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  const goOffline = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.setDriverPresence(false);
      if (!res.success || !res.data) return res.message || 'No se pudo desconectar.';
      adopt(res.data);
      return null;
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  const value: DriverPresenceValue = isDriver
    ? { presence, online, stale: online && presence?.isOnline !== true, mode, busy, goOnline, goOffline, refresh }
    : NOT_A_DRIVER;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
