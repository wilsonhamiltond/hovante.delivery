import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from './api';
import type { RegisterPayload } from './api';
import { clearToken, getToken, saveToken } from './storage';

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
    api.setAuthToken(null);
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
