import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Which deliveries this driver has already reached the office for. The home map's current-order
// leg keys off it: driver -> office until they have actually been at the counter, driver -> client
// only after -- pressing "Iniciar entrega" early from home must not flip the route prematurely.
// Persisted (localStorage on web, SecureStore on device, like the outbox) so an app restart in the
// middle of a ride does not send the map back to the office.

const KEY = 'hovante_delivery_office_reached';

export async function loadReached(): Promise<Set<string>> {
  const raw = Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(KEY) ?? null
    : await SecureStore.getItemAsync(KEY);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw) as string[]); } catch { return new Set(); }
}

export async function saveReached(ids: Set<string>): Promise<void> {
  const raw = JSON.stringify([...ids]);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}
