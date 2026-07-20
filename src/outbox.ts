import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as api from './api';

// Offline outbox (8.5.8). A driver's action taken with no signal is queued here and replayed when
// the connection returns. Each item carries a stable idempotency key (8.5.9), so a replay of
// something that actually reached the server the first time is recognised and not applied twice.
//
// Storage mirrors the token: localStorage on web, SecureStore on device. The plan's target for a
// real device queue is SQLite -- SecureStore is fine for the handful of stops in a shift and keeps
// the web demo working; swap it when the app runs natively at scale.
export type OutboxItem =
  | { key: string; deliveryId: string; type: 'start'; createdAt: string }
  | { key: string; deliveryId: string; type: 'deliver'; code: string; createdAt: string }
  | { key: string; deliveryId: string; type: 'fail'; reason: string; notes: string; createdAt: string };

const OUTBOX_KEY = 'hovante_delivery_outbox';

async function read(): Promise<OutboxItem[]> {
  const raw = Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(OUTBOX_KEY) ?? null
    : await SecureStore.getItemAsync(OUTBOX_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as OutboxItem[]; } catch { return []; }
}

async function write(items: OutboxItem[]): Promise<void> {
  const raw = JSON.stringify(items);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(OUTBOX_KEY, raw);
  else await SecureStore.setItemAsync(OUTBOX_KEY, raw);
}

export async function enqueue(item: OutboxItem): Promise<void> {
  const items = await read();
  items.push(item);
  await write(items);
}

// Stable per action, generated once when the driver taps: retries (flush) reuse it so the server
// dedupes. crypto.randomUUID where available (web), a good-enough fallback on Hermes.
export function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// One-shot: try the action online now; if the network is down, queue it for later and report it as
// accepted (the driver moves on, it syncs when signal returns). A real rejection surfaces as error.
export async function submit(item: OutboxItem): Promise<{ ok: boolean; queued: boolean; error?: string }> {
  const res = await send(item);
  if (res.success) return { ok: true, queued: false };
  if (isNetworkError(res.message)) {
    await enqueue(item);
    return { ok: true, queued: true };
  }
  return { ok: false, queued: false, error: res.message };
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

// Replays every queued action in order. An item is removed when the server accepts it -- including
// a "ya procesada" replay, which is still success. A network failure stops the flush and leaves the
// rest queued for next time. Returns how many were drained.
export async function flush(): Promise<number> {
  const items = await read();
  if (items.length === 0) return 0;

  const remaining: OutboxItem[] = [];
  let drained = 0;
  let stop = false;

  for (const item of items) {
    if (stop) { remaining.push(item); continue; }

    const res = await send(item);
    if (res.success) {
      // Includes the idempotency replay ("ya procesada"): an action that actually reached the
      // server the first time returns success on retry and is cleared.
      drained++;
    } else {
      // Any failure -- offline, an auth hiccup, or a transient error -- keeps this item and stops.
      // Losing a driver's confirmation is the worst outcome, so we never drop on failure; it retries
      // on the next flush. (A genuinely stuck item is a refinement: a retry cap or terminal-reason
      // check, once such cases are observed.)
      remaining.push(item);
      stop = true;
    }
  }

  await write(remaining);
  return drained;
}

function send(item: OutboxItem) {
  switch (item.type) {
    case 'start': return api.startDelivery(item.deliveryId, item.key);
    case 'deliver': return api.deliverDelivery(item.deliveryId, item.code, item.key);
    case 'fail': return api.failDelivery(item.deliveryId, item.reason, item.notes, item.key);
  }
}

function isNetworkError(message: string): boolean {
  return /conectar|servidor/i.test(message);
}
