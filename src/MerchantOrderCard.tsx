import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as api from './api';
import type { Order } from './api';
import { queueRemainingMin } from './orderQueue';
import { t } from './theme';
import { strings, useStrings, type Locale } from './i18n';

// One order as the merchant sees it in a list -- shared by the counter's queue (MerchantHome) and
// the history screen, which show the same card and differ only in whether the pipeline actions are
// offered. Both open the order's full detail on press.

const money = (n: number) => `RD$${n.toFixed(2)}`;

const S: Record<
  Locale,
  {
    cancelled: string;
    delivered: string;
    inTransit: string;
    assigned: string;
    failed: string;
    returned: string;
    fresh: string;
    queued: (min: number) => string;
    preparing: string;
    confirmed: string;
    readyWaitingClient: string;
    readyFindingDriver: string;
    pickupAtStore: string;
    fee: (amount: string) => string;
    promisedNow: string;
    promisedIn: (min: number) => string;
    confirm: string;
    reject: string;
    readyForPickup: string;
    deliverToClient: string;
    deliveryOnTheWay: string;
  }
> = {
  es: {
    cancelled: 'Cancelado',
    delivered: 'Entregado',
    inTransit: 'En camino',
    assigned: 'Repartidor asignado',
    failed: 'Entrega fallida',
    returned: 'Devuelto',
    fresh: 'Nuevo',
    queued: (min) => `En cola · ${min} min`,
    preparing: 'En preparación',
    confirmed: 'Confirmado',
    readyWaitingClient: 'Listo · esperando al cliente',
    readyFindingDriver: 'Listo · buscando repartidor',
    pickupAtStore: '🏪 Retiro en tienda · el cliente pasa a recogerlo',
    fee: (amount) => `+ envío ${amount}`,
    promisedNow: 'Se prometió empezar de inmediato',
    promisedIn: (min) => `Se prometió empezar en ${min} min`,
    confirm: 'Confirmar',
    reject: 'Rechazar',
    readyForPickup: 'Listo para recoger',
    deliverToClient: '🏪 Entregar al cliente',
    deliveryOnTheWay: '🛵 Entrega en camino',
  },
  en: {
    cancelled: 'Cancelled',
    delivered: 'Delivered',
    inTransit: 'On the way',
    assigned: 'Driver assigned',
    failed: 'Delivery failed',
    returned: 'Returned',
    fresh: 'New',
    queued: (min) => `In queue · ${min} min`,
    preparing: 'Being prepared',
    confirmed: 'Confirmed',
    readyWaitingClient: 'Ready · waiting for the customer',
    readyFindingDriver: 'Ready · finding a driver',
    pickupAtStore: '🏪 Pickup at store · the customer will come to collect it',
    fee: (amount) => `+ delivery ${amount}`,
    promisedNow: 'Promised to start right away',
    promisedIn: (min) => `Promised to start in ${min} min`,
    confirm: 'Confirm',
    reject: 'Reject',
    readyForPickup: 'Ready for pickup',
    deliverToClient: '🏪 Hand over to the customer',
    deliveryOnTheWay: '🛵 Delivery on the way',
  },
  fr: {
    cancelled: 'Annulée',
    delivered: 'Livrée',
    inTransit: 'En route',
    assigned: 'Livreur assigné',
    failed: 'Livraison échouée',
    returned: 'Retournée',
    fresh: 'Nouvelle',
    queued: (min) => `En attente · ${min} min`,
    preparing: 'En préparation',
    confirmed: 'Confirmée',
    readyWaitingClient: 'Prête · en attente du client',
    readyFindingDriver: 'Prête · recherche d’un livreur',
    pickupAtStore: '🏪 Retrait en magasin · le client viendra la chercher',
    fee: (amount) => `+ livraison ${amount}`,
    promisedNow: 'Début promis immédiatement',
    promisedIn: (min) => `Début promis dans ${min} min`,
    confirm: 'Confirmer',
    reject: 'Refuser',
    readyForPickup: 'Prête à récupérer',
    deliverToClient: '🏪 Remettre au client',
    deliveryOnTheWay: '🛵 Livraison en route',
  },
};

// The merchant cares where the order stands in THEIR pipeline first, then in the street.
// Exported so the order-details screen wears the same chip.
export function statusOf(o: Order): { label: string; color: string } {
  const tx = strings(S);
  if (o.status === 'CANCELLED') return { label: tx.cancelled, color: '#dc2626' };
  switch (o.deliveryStatus) {
    case 'DELIVERED': return { label: tx.delivered, color: '#16a34a' };
    case 'IN_TRANSIT': return { label: tx.inTransit, color: '#0ea5e9' };
    case 'ASSIGNED': return { label: tx.assigned, color: '#2563eb' };
    case 'FAILED': return { label: tx.failed, color: '#dc2626' };
    case 'RETURNED': return { label: tx.returned, color: '#dc2626' };
  }
  switch (o.status) {
    case 'PENDING': return { label: tx.fresh, color: '#d97706' };
    case 'CONFIRMED': {
      // The queue phase the merchant declared at confirm, derived from the clock (orderQueue.ts):
      // EN COLA while the wait runs, EN PREPARACIÓN once it is due -- the stage before "listo para
      // recoger". The screens showing this chip poll, so it advances on its own.
      const remaining = queueRemainingMin(o);
      if (remaining != null && remaining > 0) return { label: tx.queued(remaining), color: '#0891b2' };
      if (remaining === 0) return { label: tx.preparing, color: '#7c3aed' };
      return { label: tx.confirmed, color: '#2563eb' };
    }
    case 'PREPARING': return { label: tx.preparing, color: '#7c3aed' };
    // A retiro en tienda waits for its customer, not for a rider.
    case 'READY': return o.pickupAtStore
      ? { label: tx.readyWaitingClient, color: '#16a34a' }
      : { label: tx.readyFindingDriver, color: '#7c3aed' };
    case 'DELIVERED': return { label: tx.delivered, color: '#16a34a' };
  }
  return { label: o.status, color: '#64748b' };
}

export function MerchantOrderCard({ order, busy = false, onOpen, onAct, onConfirm, onTrackDriver }: {
  order: Order;
  busy?: boolean;
  onOpen: (id: string) => void;
  // The counter's quick actions. Omitted on the history screen, where every order has already
  // finished and none of the transitions apply.
  onAct?: (id: string, fn: (id: string) => Promise<api.ApiResponse<Order>>) => void;
  // Accepting is the one action that does not fire straight away: it first asks (in the caller's
  // modal) how long the order will queue, so the caller opens that instead of calling the API.
  onConfirm?: (id: string) => void;
  // Opens the driver-approach map once a courier holds the delivery. Omitted on the history
  // screen along with the other actions.
  onTrackDriver?: (id: string) => void;
}) {
  const tx = useStrings(S);
  const s = statusOf(order);
  return (
    <Pressable style={styles.card} onPress={() => onOpen(order.id)}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
      </View>

      {order.customerName ? (
        <View style={styles.clientRow}>
          <Text style={styles.client} numberOfLines={1}>👤 {order.customerName}</Text>
          {order.customerPhone ? (
            <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
              <Text style={styles.callText}>📞 {order.customerPhone}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {order.address ? <Text style={styles.address} numberOfLines={2}>📍 {order.address}</Text> : null}
      {/* Said on every pickup order, whatever its stage: the counter must know from the first
          glance that no rider is coming for this bag. */}
      {order.pickupAtStore ? (
        <Text style={styles.address}>{tx.pickupAtStore}</Text>
      ) : null}

      <Text style={styles.items} numberOfLines={3}>
        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
      </Text>
      {order.notes ? <Text style={styles.notes} numberOfLines={2}>📝 {order.notes}</Text> : null}

      <View style={styles.totalRow}>
        <Text style={styles.total}>{money(order.total)}</Text>
        {order.deliveryFee != null ? (
          <Text style={styles.fee}>{tx.fee(money(order.deliveryFee))}</Text>
        ) : null}
      </View>

      {/* The promise made at confirm, spelled out under the live chip: what was declared, so the
          counter can hold itself to it even after the countdown has moved on. */}
      {order.queueMinutes != null && order.status === 'CONFIRMED' ? (
        <Text style={styles.queue}>
          ⏱️ {order.queueMinutes === 0
            ? tx.promisedNow
            : tx.promisedIn(order.queueMinutes)}
        </Text>
      ) : null}

      {/* The counter's actions, mirroring the web: accept or reject a new order, then release it
          to the driver pool once the bag is packed. */}
      {onAct == null ? null : order.status === 'PENDING' ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.confirm, busy && styles.disabled]}
            disabled={busy}
            // Through the queue-time modal when the caller offers one; straight through otherwise.
            onPress={() => (onConfirm ? onConfirm(order.id) : onAct(order.id, api.confirmMerchantOrder))}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.confirm}</Text>}
          </Pressable>
          <Pressable
            style={[styles.action, styles.reject, busy && styles.disabled]}
            disabled={busy}
            onPress={() => onAct(order.id, api.rejectMerchantOrder)}
          >
            <Text style={styles.actionText}>{tx.reject}</Text>
          </Pressable>
        </View>
      ) : order.status === 'CONFIRMED' || order.status === 'PREPARING' ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.ready, busy && styles.disabled]}
            disabled={busy}
            onPress={() => onAct(order.id, api.readyMerchantOrder)}
          >
            {/* The accent is near-white, so this button's ink is onAccent, not the white the red
                and green buttons use -- white on white was an invisible button. */}
            {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.actionText, styles.readyText]}>{tx.readyForPickup}</Text>}
          </Pressable>
        </View>
      ) : null}

      {/* A pickup order at READY waits for its customer, and the handover (code and all) lives on
          the order's detail screen -- so the card's action is simply the way there. */}
      {onAct != null && order.pickupAtStore && order.status === 'READY' ? (
        <View style={styles.actions}>
          <Pressable style={[styles.action, styles.confirm]} onPress={() => onOpen(order.id)}>
            <Text style={styles.actionText}>{tx.deliverToClient}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* A courier holds the delivery (claimed the pickup, or already riding): the counter can
          watch them approach on the map. Deliberately outside the onAct block above -- by then the
          order sits at READY, whose branch offers nothing. */}
      {onTrackDriver && (order.deliveryStatus === 'ASSIGNED' || order.deliveryStatus === 'IN_TRANSIT') ? (
        <View style={styles.actions}>
          <Pressable style={[styles.action, styles.track]} onPress={() => onTrackDriver(order.id)}>
            <Text style={styles.actionText}>{tx.deliveryOnTheWay}</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: t.text },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '60%' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  client: { flex: 1, fontSize: 14, fontWeight: '700', color: t.text },
  callBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  callText: { color: t.text, fontWeight: '700', fontSize: 12 },
  address: { fontSize: 13, color: t.textMuted },
  items: { fontSize: 13, color: t.textMuted },
  notes: { fontSize: 13, color: t.textMuted, fontStyle: 'italic' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  total: { fontSize: 17, fontWeight: '900', color: t.text },
  fee: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  queue: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirm: { backgroundColor: '#16a34a' },
  ready: { backgroundColor: t.accent },
  reject: { backgroundColor: '#dc2626' },
  // The IN_TRANSIT chip's sky blue: the button and the status it tracks wear one colour.
  track: { backgroundColor: '#0ea5e9' },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // On the near-white accent button, white ink would vanish.
  readyText: { color: t.onAccent },
  disabled: { opacity: 0.6 },
});
