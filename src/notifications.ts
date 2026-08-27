import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import * as api from './api';
import type { Delivery, Order } from './api';
import { orderStatusChip } from './orderStatus';

// The customer's notification inbox, derived from their own orders rather than stored anywhere.
//
// Everything a customer would be notified about IS an order changing state -- the merchant
// accepted it, a rider took it, it is at the door -- and the app already fetches those orders for
// the home and the orders list. So the inbox is a reading of that data, not a second copy of it:
// one entry per order, saying the latest thing that happened to it. Nothing to migrate, nothing to
// keep in sync, and it works the moment the screen opens rather than only for pushes that arrived
// while the app happened to be installed and permitted.
//
// The trade is that it holds no history: an order shows what it is doing NOW, not every step it
// took. When a real notifications table exists server-side this module is the seam to replace --
// the screen and the header badge only speak to `notices()` and `unreadCount()`.

export interface Notice {
  /** Order id + the state it is in: a new state makes a new (unread) entry for the same order. */
  id: string;
  orderId: string;
  title: string;
  body: string;
  /** Chip colour for the state, so the inbox reads like the order cards do. */
  color: string;
  /** When this state was reached, as far as the order can say. */
  at: string;
}

// The state an order is in, as a key. Deliberately NOT the chip's label: a queued order's label
// counts down every minute ("En cola · ~9 min"), and keying on that would make it unread again on
// every tick.
function stateKey(o: Order): string {
  return `${o.status}|${o.deliveryStatus ?? ''}`;
}

// What the customer is told, per state. The chip's own words carry the state itself, so this is
// the sentence around it -- what it means for them.
function bodyFor(o: Order): string {
  switch (o.deliveryStatus) {
    case 'IN_TRANSIT': return 'Tu pedido va en camino.';
    case 'ASSIGNED': return 'Un repartidor tomó tu pedido.';
    case 'DELIVERED': return '¡Tu pedido fue entregado!';
    case 'FAILED': return 'La entrega no pudo completarse.';
    case 'RETURNED': return 'Tu pedido fue devuelto al comercio.';
  }
  if (o.status === 'CANCELLED') return 'Tu pedido fue cancelado.';
  switch (o.status) {
    case 'PENDING': return 'Esperando que el comercio confirme tu pedido.';
    case 'CONFIRMED': return 'El comercio aceptó tu pedido.';
    case 'PREPARING': return 'El comercio está preparando tu pedido.';
    case 'READY': return o.pickupAtStore
      ? 'Tu pedido está listo para recoger.'
      : 'Tu pedido está listo, buscando repartidor.';
    case 'DELIVERED': return '¡Tu pedido fue entregado!';
  }
  return 'Tu pedido cambió de estado.';
}

/**
 * One notice per order, newest first. `now` is only threaded through for the queue countdown in the
 * chip, so a test can pin it.
 */
export function notices(orders: Order[], now: number = Date.now()): Notice[] {
  return orders
    .map((o) => {
      const chip = orderStatusChip(o, now);
      return {
        id: `${o.id}:${stateKey(o)}`,
        orderId: o.id,
        title: `${o.orderNumber} · ${chip.label}`,
        body: `${o.merchantName ?? 'Tu pedido'} — ${bodyFor(o)}`,
        color: chip.color,
        // The confirm stamp is the closest thing the order carries to "when this happened"; before
        // that, when it was placed.
        at: o.confirmedAt ?? o.createdAt,
      };
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// A driver's own deliveries, read the same way: one entry per stop, saying where it stands. The
// pool of unclaimed work is deliberately NOT here -- that is the home map's job, and a pin they
// have not taken is an offer, not news about their day.
function driverBody(d: Delivery): string {
  switch (d.status) {
    case 'DELIVERED': return 'Entrega completada.';
    case 'IN_TRANSIT': return 'Vas en camino al cliente.';
    case 'ASSIGNED': return 'Tomaste esta entrega. Pasa a recogerla.';
    case 'PENDING': return 'Entrega asignada, pendiente de recoger.';
    case 'FAILED': return 'Esta entrega fue marcada como fallida.';
    case 'RETURNED': return 'Pedido devuelto al comercio.';
    case 'CANCELLED': return 'Esta entrega fue cancelada.';
  }
  return 'Esta entrega cambió de estado.';
}

const DRIVER_COLORS: Record<string, string> = {
  DELIVERED: '#16a34a', IN_TRANSIT: '#0ea5e9', ASSIGNED: '#2563eb', PENDING: '#d97706',
  FAILED: '#dc2626', RETURNED: '#dc2626', CANCELLED: '#dc2626',
};

export function driverNotices(deliveries: Delivery[]): Notice[] {
  return deliveries
    .map((d) => ({
      id: `${d.id}:${d.status}`,
      orderId: d.id,
      title: `${d.deliveryNumber ?? 'Entrega'} · ${d.recipientName ?? 'Cliente'}`,
      body: driverBody(d),
      color: DRIVER_COLORS[d.status] ?? '#64748b',
      // The latest stamp the delivery carries; falling back to when it was created.
      at: d.deliveredAt ?? d.failedAt ?? d.inTransitAt ?? d.scheduledDate ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// What a counter needs told: an order landed, or the street moved one along. Same orders the
// merchant home lists, read as events.
function merchantBody(o: Order): string {
  switch (o.deliveryStatus) {
    case 'ASSIGNED': return 'Un repartidor viene a recogerlo.';
    case 'IN_TRANSIT': return 'El repartidor salió con el pedido.';
    case 'DELIVERED': return 'Entregado al cliente.';
    case 'FAILED': return 'La entrega falló.';
    case 'RETURNED': return 'El pedido fue devuelto.';
  }
  if (o.status === 'CANCELLED') return 'El cliente canceló este pedido.';
  switch (o.status) {
    case 'PENDING': return '¡Pedido nuevo! Confírmalo para empezar.';
    case 'CONFIRMED': return 'Confirmado. Prepáralo cuando puedas.';
    case 'PREPARING': return 'En preparación.';
    case 'READY': return o.pickupAtStore
      ? 'Listo. El cliente pasa a recogerlo.'
      : 'Listo. Esperando repartidor.';
    case 'DELIVERED': return 'Entregado al cliente.';
  }
  return 'Este pedido cambió de estado.';
}

export function merchantNotices(orders: Order[], now: number = Date.now()): Notice[] {
  return orders
    .map((o) => {
      const chip = orderStatusChip(o, now);
      return {
        id: `${o.id}:${stateKey(o)}`,
        orderId: o.id,
        title: `${o.orderNumber} · ${o.customerName ?? 'Cliente'}`,
        body: merchantBody(o),
        color: chip.color,
        at: o.confirmedAt ?? o.createdAt,
      };
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** How many of these the customer has not seen yet. */
export function unreadCount(list: Notice[], read: string[]): number {
  const seen = new Set(read);
  return list.filter((n) => !seen.has(n.id)).length;
}

// Read marks live on the device, like the outbox and the pickup progress: localStorage on web,
// SecureStore on a phone. They are per-device on purpose -- "I have seen this" is about this
// handset, and there is no server field to hang it on.
const READ_KEY = 'hovante_notifications_read';
// Trimmed when saving: an account with hundreds of past orders would otherwise grow this forever,
// and a mark old enough to fall off is one whose order is long finished.
const READ_LIMIT = 200;

export async function loadRead(): Promise<string[]> {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(READ_KEY)
      : await SecureStore.getItemAsync(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    // Unreadable marks mean everything reads as unread, which is the safe way to be wrong here.
    return [];
  }
}

export async function saveRead(ids: string[]): Promise<void> {
  const raw = JSON.stringify(ids.slice(-READ_LIMIT));
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(READ_KEY, raw);
    else await SecureStore.setItemAsync(READ_KEY, raw);
  } catch { /* a failed mark only means the badge comes back; never worth an error */ }
}

/** Adds these ids to what has been seen, keeping the rest. */
export async function markRead(ids: string[]): Promise<string[]> {
  const merged = [...new Set([...(await loadRead()), ...ids])];
  await saveRead(merged);
  return merged;
}

/** Whose news this is. Each role reads a different list and is told a different thing about it. */
export type Audience = 'client' | 'driver' | 'merchant';

/** Which role's inbox a profile should see, matching how home.tsx picks a home screen. */
export function audienceOf(profile: { isMerchant?: boolean; isDriver?: boolean } | null): Audience {
  if (profile?.isMerchant) return 'merchant';
  if (profile?.isDriver) return 'driver';
  return 'client';
}

async function loadFor(audience: Audience): Promise<Notice[]> {
  if (audience === 'driver') {
    const res = await api.myDeliveries();
    return driverNotices(res.success ? res.data ?? [] : []);
  }
  if (audience === 'merchant') {
    const res = await api.merchantOrders();
    return merchantNotices(res.success ? res.data ?? [] : []);
  }
  const [active, history] = await Promise.all([
    api.myOrders(),
    // The finished ones matter too: "entregado" is a notification, and it is the last thing that
    // happened to that order.
    api.myOrderHistory(0, 10),
  ]);
  return notices([
    ...(active.success ? active.data ?? [] : []),
    ...(history.success ? history.data ?? [] : []),
  ]);
}

/**
 * The signed-in person's inbox, reloaded on focus. Every home uses it for the bell's badge and the
 * notifications screen for the list itself, so they agree without passing anything down.
 *
 * Guests have no orders and get an empty inbox: the bell is still there, and says so.
 */
export function useNotices(audience: Audience | null = 'client') {
  const [list, setList] = useState<Notice[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Null means "whose inbox this is has not been settled yet" -- the notifications screen resolves
    // the role before it can ask. Fetching the client's orders meanwhile would spend a request and
    // flash the wrong list at a driver.
    if (!audience) return;
    const [fresh, marks] = await Promise.all([loadFor(audience), loadRead()]);
    setList(fresh);
    setRead(marks);
  }, [audience]);

  useFocusEffect(useCallback(() => {
    if (!audience) return;
    let alive = true;
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, audience]));

  const markAllRead = useCallback(async () => {
    setRead(await markRead(list.map((n) => n.id)));
  }, [list]);

  return { list, read, loading, unread: unreadCount(list, read), markAllRead, reload: load };
}
