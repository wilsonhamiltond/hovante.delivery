import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { RegisterPayload } from './api';
import { clearToken, getToken, saveToken } from './storage';
import { registerForPush, unregisterFromPush } from './pushNotifications';

interface AuthState {
  token: string | null;
  // While the stored token is being read on startup, routes wait rather than flashing login.
  loading: boolean;
  // Whether the account still owes us the sign-up details. null while unknown (no token yet, or
  // the check is in flight), which the gate waits on rather than guessing.
  profileComplete: boolean | null;
  // Re-checks it after the completion form is submitted, which releases the gate.
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: (token: string) => Promise<string | null>;
  signInWithFacebook: (token: string) => Promise<string | null>;
  signInWithApple: (token: string) => Promise<string | null>;
  signUp: (payload: RegisterPayload) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  // Asks the API who this token belongs to and whether the sign-up details are still owed. A failed
  // check counts as complete on purpose: a flaky network must not trap someone in the completion
  // form, and the next launch re-checks anyway.
  const checkProfile = async () => {
    const res = await api.me();
    setProfileComplete(res.success ? api.isProfileComplete(res.data) : true);
  };

  useEffect(() => {
    getToken()
      .then(async (stored) => {
        api.setAuthToken(stored);
        setToken(stored);
        // A restored session is checked too: someone who closed the app part-way through the
        // completion form is sent back to it rather than let into a half-set-up account.
        if (stored) await checkProfile();
      })
      .finally(() => setLoading(false));
  }, []);

  // Persist the sliding-refresh token the API adopts on each request (8.5.1). Only writes storage,
  // never React state: the api client already holds the new token for subsequent calls, and setting
  // state on every response caused an effect/refetch loop.
  useEffect(() => {
    api.setTokenRotationHandler((rotated) => {
      saveToken(rotated);
    });
  }, []);

  // Push registration follows the session. Held in a ref rather than state: nothing renders from
  // it, and sign-out needs to read the latest value without re-running an effect to get it.
  const pushToken = useRef<string | null>(null);

  // Any authenticated call coming back 401 means this session is over -- most often a token that
  // expired while the app was closed. Ending it here is what turns that into a trip back to the
  // welcome screen, instead of every screen having to render its own "no se pudo cargar" with a
  // status code on it.
  //
  // Deliberately not signOut(): that first unregisters this device from push, an authenticated
  // call that the dead token could only 401 on -- re-entering this handler. The device is left
  // registered and the next sign-in re-registers it.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      pushToken.current = null;
      api.setAuthToken(null);
      api.clearCachedMe();
      setToken(null);
      setProfileComplete(null);
      clearToken();
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!token || profileComplete !== true) return;
    let active = true;
    (async () => {
      // Every role now, because every role is pushed to: drivers hear about work to pick up,
      // merchants about orders landing at their counter, and customers about their own order
      // changing state. The profile is only needed as "the session is real": checkProfile just
      // fetched it to compute profileComplete, so the cached copy answers without a THIRD /me on
      // every launch -- the network is only asked when the cache is somehow empty.
      if (!api.cachedMe()) {
        const res = await api.me();
        if (!active || !res.success) return;
      }
      if (!active) return;
      const registered = await registerForPush();
      if (active) pushToken.current = registered;
    })();
    return () => { active = false; };
  }, [token, profileComplete]);

  const adopt = async (token: string) => {
    api.setAuthToken(token);
    await saveToken(token);
    setToken(token);
    await checkProfile();
  };

  // Returns null on success, or the API's error message to show on the form.
  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (!res.success) return res.message;
    await adopt(res.data);
    return null;
  };

  // Google and Facebook both run as browser flows the API owns end to end: it verifies the
  // provider's answer and issues our JWT itself, so there is no token to exchange here, only one to
  // adopt. Same null-on-success contract as signIn.
  const signInWithGoogle = async (token: string) => {
    if (!token) return 'No se pudo iniciar sesión con Google.';
    await adopt(token);
    return null;
  };

  const signInWithFacebook = async (token: string) => {
    if (!token) return 'No se pudo iniciar sesión con Facebook.';
    await adopt(token);
    return null;
  };

  const signInWithApple = async (token: string) => {
    if (!token) return 'No se pudo iniciar sesión con Apple.';
    await adopt(token);
    return null;
  };

  const signUp = async (payload: RegisterPayload) => {
    const res = await api.register(payload);
    if (!res.success) return res.message;
    // Register returns a token: the account is signed in the moment it is created.
    await adopt(res.data);
    return null;
  };

  const signOut = async () => {
    // First, while the bearer token is still set -- unregistering is an authenticated call, and
    // doing it after would silently no-op and leave this handset receiving the next driver's work.
    await unregisterFromPush(pushToken.current);
    pushToken.current = null;

    api.setAuthToken(null);
    // Drops the cached profile the tab bar reads its role from, so the next account to sign in
    // cannot inherit this one's bar.
    api.clearCachedMe();
    await clearToken();
    setToken(null);
    setProfileComplete(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token, loading, profileComplete, refreshProfile: checkProfile,
        signIn, signInWithGoogle, signInWithFacebook, signInWithApple, signUp, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
