import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from './api';
import type { RegisterPayload } from './api';
import { clearToken, getToken, saveToken } from './storage';

interface AuthState {
  token: string | null;
  // While the stored token is being read on startup, routes wait rather than flashing login.
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: (idToken: string, type?: 'client' | 'driver') => Promise<string | null>;
  signUp: (payload: RegisterPayload) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken()
      .then((stored) => {
        api.setAuthToken(stored);
        setToken(stored);
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
  };

  // Returns null on success, or the API's error message to show on the form.
  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (!res.success) return res.message;
    await adopt(res.data);
    return null;
  };

  // Exchange a Google ID token (from the device's Google flow) for our JWT, then adopt it -- the
  // server signs in or creates the delivery account. Same null-on-success contract as signIn.
  const signInWithGoogle = async (idToken: string, type: 'client' | 'driver' = 'client') => {
    const res = await api.googleLogin(idToken, type);
    if (!res.success) return res.message;
    await adopt(res.data);
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
  };

  return (
    <AuthContext.Provider value={{ token, loading, signIn, signInWithGoogle, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
