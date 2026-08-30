import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';
import * as api from './api';
import type { Delivery, Order } from './api';
import { orderStatusChip } from './orderStatus';
import { strings, type Locale } from './i18n';

// Everything the inbox says, per audience. Read through strings() inside each function (never at
// module load), so a language switch shows on the next reading of the same orders.
const S: Record<
  Locale,
  {
    inTransit: string;
    assigned: string;
    delivered: string;
    failed: string;
    returned: string;
    cancelled: string;
    pending: string;
    confirmed: string;
    preparing: string;
    readyPickup: string;
    readyFindingDriver: string;
    changed: string;
    yourOrder: string;
    driverDelivered: string;
    driverInTransit: string;
    driverAssigned: string;
    driverPending: string;
    driverFailed: string;
    driverReturned: string;
    driverCancelled: string;
    driverChanged: string;
    deliveryFallback: string;
    clientFallback: string;
    merchantAssigned: string;
    merchantInTransit: string;
    merchantDelivered: string;
    merchantFailed: string;
    merchantReturned: string;
    merchantCancelled: string;
    merchantPending: string;
    merchantConfirmed: string;
    merchantPreparing: string;
    merchantReadyPickup: string;
    merchantReadyDriver: string;
    merchantChanged: string;
  }
> = {
  es: {
    inTransit: 'Tu pedido va en camino.',
    assigned: 'Un repartidor tomó tu pedido.',
    delivered: '¡Tu pedido fue entregado!',
    failed: 'La entrega no pudo completarse.',
    returned: 'Tu pedido fue devuelto al comercio.',
    cancelled: 'Tu pedido fue cancelado.',
    pending: 'Esperando que el comercio confirme tu pedido.',
    confirmed: 'El comercio aceptó tu pedido.',
    preparing: 'El comercio está preparando tu pedido.',
    readyPickup: 'Tu pedido está listo para recoger.',
    readyFindingDriver: 'Tu pedido está listo, buscando repartidor.',
    changed: 'Tu pedido cambió de estado.',
    yourOrder: 'Tu pedido',
    driverDelivered: 'Entrega completada.',
    driverInTransit: 'Vas en camino al cliente.',
    driverAssigned: 'Tomaste esta entrega. Pasa a recogerla.',
    driverPending: 'Entrega asignada, pendiente de recoger.',
    driverFailed: 'Esta entrega fue marcada como fallida.',
    driverReturned: 'Pedido devuelto al comercio.',
    driverCancelled: 'Esta entrega fue cancelada.',
    driverChanged: 'Esta entrega cambió de estado.',
    deliveryFallback: 'Entrega',
    clientFallback: 'Cliente',
    merchantAssigned: 'Un repartidor viene a recogerlo.',
    merchantInTransit: 'El repartidor salió con el pedido.',
    merchantDelivered: 'Entregado al cliente.',
    merchantFailed: 'La entrega falló.',
    merchantReturned: 'El pedido fue devuelto.',
    merchantCancelled: 'El cliente canceló este pedido.',
    merchantPending: '¡Pedido nuevo! Confírmalo para empezar.',
    merchantConfirmed: 'Confirmado. Prepáralo cuando puedas.',
    merchantPreparing: 'En preparación.',
    merchantReadyPickup: 'Listo. El cliente pasa a recogerlo.',
    merchantReadyDriver: 'Listo. Esperando repartidor.',
    merchantChanged: 'Este pedido cambió de estado.',
  },
  en: {
    inTransit: 'Your order is on the way.',
    assigned: 'A driver picked up your order.',
    delivered: 'Your order was delivered!',
    failed: 'The delivery could not be completed.',
    returned: 'Your order was returned to the store.',
    cancelled: 'Your order was cancelled.',
    pending: 'Waiting for the store to confirm your order.',
    confirmed: 'The store accepted your order.',
    preparing: 'The store is preparing your order.',
    readyPickup: 'Your order is ready for pickup.',
    readyFindingDriver: 'Your order is ready, finding a driver.',
    changed: 'Your order changed status.',
    yourOrder: 'Your order',
    driverDelivered: 'Delivery completed.',
    driverInTransit: 'You are on your way to the customer.',
    driverAssigned: 'You took this delivery. Go pick it up.',
    driverPending: 'Delivery assigned, waiting for pickup.',
    driverFailed: 'This delivery was marked as failed.',
    driverReturned: 'Order returned to the store.',
    driverCancelled: 'This delivery was cancelled.',
    driverChanged: 'This delivery changed status.',
    deliveryFallback: 'Delivery',
    clientFallback: 'Customer',
    merchantAssigned: 'A driver is coming to pick it up.',
    merchantInTransit: 'The driver left with the order.',
    merchantDelivered: 'Delivered to the customer.',
    merchantFailed: 'The delivery failed.',
    merchantReturned: 'The order was returned.',
    merchantCancelled: 'The customer cancelled this order.',
    merchantPending: 'New order! Confirm it to get started.',
    merchantConfirmed: 'Confirmed. Prepare it when you can.',
    merchantPreparing: 'Being prepared.',
    merchantReadyPickup: 'Ready. The customer is coming to collect it.',
    merchantReadyDriver: 'Ready. Waiting for a driver.',
    merchantChanged: 'This order changed status.',
  },
};

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
  const tx = strings(S);
  switch (o.deliveryStatus) {
    case 'IN_TRANSIT': return tx.inTransit;
    case 'ASSIGNED': return tx.assigned;
    case 'DELIVERED': return tx.delivered;
    case 'FAILED': return tx.failed;
    case 'RETURNED': return tx.returned;
  }
  if (o.status === 'CANCELLED') return tx.cancelled;
  switch (o.status) {
    case 'PENDING': return tx.pending;
    case 'CONFIRMED': return tx.confirmed;
    case 'PREPARING': return tx.preparing;
    case 'READY': return o.pickupAtStore
      ? tx.readyPickup
      : tx.readyFindingDriver;
    case 'DELIVERED': return tx.delivered;
  }
  return tx.changed;
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
        body: `${o.merchantName ?? strings(S).yourOrder} — ${bodyFor(o)}`,
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
  const tx = strings(S);
  switch (d.status) {
    case 'DELIVERED': return tx.driverDelivered;
    case 'IN_TRANSIT': return tx.driverInTransit;
    case 'ASSIGNED': return tx.driverAssigned;
    case 'PENDING': return tx.driverPending;
    case 'FAILED': return tx.driverFailed;
    case 'RETURNED': return tx.driverReturned;
    case 'CANCELLED': return tx.driverCancelled;
  }
  return tx.driverChanged;
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
      title: `${d.deliveryNumber ?? strings(S).deliveryFallback} · ${d.recipientName ?? strings(S).clientFallback}`,
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
  const tx = strings(S);
  switch (o.deliveryStatus) {
    case 'ASSIGNED': return tx.merchantAssigned;
    case 'IN_TRANSIT': return tx.merchantInTransit;
    case 'DELIVERED': return tx.merchantDelivered;
    case 'FAILED': return tx.merchantFailed;
    case 'RETURNED': return tx.merchantReturned;
  }
  if (o.status === 'CANCELLED') return tx.merchantCancelled;
  switch (o.status) {
    case 'PENDING': return tx.merchantPending;
    case 'CONFIRMED': return tx.merchantConfirmed;
    case 'PREPARING': return tx.merchantPreparing;
    case 'READY': return o.pickupAtStore
      ? tx.merchantReadyPickup
      : tx.merchantReadyDriver;
    case 'DELIVERED': return tx.merchantDelivered;
  }
  return tx.merchantChanged;
}

export function merchantNotices(orders: Order[], now: number = Date.now()): Notice[] {
  return orders
    .map((o) => {
      const chip = orderStatusChip(o, now);
      return {
        id: `${o.id}:${stateKey(o)}`,
        orderId: o.id,
        title: `${o.orderNumber} · ${o.customerName ?? strings(S).clientFallback}`,
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

// Read and dismissed marks live on the device, like the outbox and the pickup progress:
// localStorage on web, SecureStore on a phone. They are per-device on purpose -- "I have seen
// this" and "I cleared this" are about this handset, and there is no server field to hang them on.
const READ_KEY = 'hovante_notifications_read';
const DISMISSED_KEY = 'hovante_notifications_dismissed';
// Trimmed when saving: an account with hundreds of past orders would otherwise grow this forever,
// and a mark old enough to fall off is one whose order is long finished.
const MARK_LIMIT = 200;

async function loadMarks(key: string): Promise<string[]> {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(key)
      : await SecureStore.getItemAsync(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    // Unreadable marks mean everything reads as unread (or undismissed), which is the safe way to
    // be wrong here: the worst outcome is seeing a notice again.
    return [];
  }
}

async function saveMarks(key: string, ids: string[]): Promise<void> {
  const raw = JSON.stringify(ids.slice(-MARK_LIMIT));
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, raw);
    else await SecureStore.setItemAsync(key, raw);
  } catch { /* a failed mark only means the notice comes back; never worth an error */ }
}

/** Adds these ids to the named mark set, keeping the rest, and returns the merged set. */
async function addMarks(key: string, ids: string[]): Promise<string[]> {
  const merged = [...new Set([...(await loadMarks(key)), ...ids])];
  await saveMarks(key, merged);
  return merged;
}

export const loadRead = () => loadMarks(READ_KEY);
export const saveRead = (ids: string[]) => saveMarks(READ_KEY, ids);
/** Adds these ids to what has been seen, keeping the rest. */
export const markRead = (ids: string[]) => addMarks(READ_KEY, ids);

export const loadDismissed = () => loadMarks(DISMISSED_KEY);
/** Adds these ids to what has been cleared from the inbox, keeping the rest. */
export const markDismissed = (ids: string[]) => addMarks(DISMISSED_KEY, ids);

/**
 * The list with cleared entries removed. Because a notice's id carries the order's STATE, a
 * dismissed order comes back the moment it advances -- clearing "en preparación" does not swallow
 * the later "va en camino", which is exactly the difference between "seen it" and "never tell me".
 */
export function visibleNotices(list: Notice[], dismissed: string[]): Notice[] {
  const gone = new Set(dismissed);
  return list.filter((n) => !gone.has(n.id));
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
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Null means "whose inbox this is has not been settled yet" -- the notifications screen resolves
    // the role before it can ask. Fetching the client's orders meanwhile would spend a request and
    // flash the wrong list at a driver.
    if (!audience) return;
    const [fresh, marks, gone] = await Promise.all([loadFor(audience), loadRead(), loadDismissed()]);
    setList(fresh);
    setRead(marks);
    setDismissed(gone);
  }, [audience]);

  useFocusEffect(useCallback(() => {
    if (!audience) return;
    let alive = true;
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, audience]));

  // What the screen and the badge actually see: cleared entries are gone from both, so a dismissed
  // notice cannot keep a bell lit any more than it can sit in the list.
  const visible = useMemo(() => visibleNotices(list, dismissed), [list, dismissed]);

  const markAllRead = useCallback(async () => {
    setRead(await markRead(visible.map((n) => n.id)));
  }, [visible]);

  /** Clears one entry -- tapping a notice both opens its order and takes it off the list. */
  const dismiss = useCallback(async (id: string) => {
    setDismissed(await markDismissed([id]));
  }, []);

  /** The "clear all" button: empties the inbox as it stands now. */
  const dismissAll = useCallback(async () => {
    setDismissed(await markDismissed(visible.map((n) => n.id)));
  }, [visible]);

  return {
    list: visible, read, loading,
    unread: unreadCount(visible, read),
    markAllRead, dismiss, dismissAll, reload: load,
  };
}
