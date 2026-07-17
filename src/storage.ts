import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Token storage. expo-secure-store is the right home on a device (Keychain / Keystore) but it is
// native-only and throws on web, so web falls back to localStorage. Web is a dev/testing surface;
// the real app runs on a phone, where SecureStore applies.
const TOKEN_KEY = 'hovante_delivery_token';

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
