import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as api from './api';
import type { Order } from './api';
import { t } from './theme';

// One order as the merchant sees it in a list -- shared by the counter's queue (MerchantHome) and
// the history screen, which show the same card and differ only in whether the pipeline actions are
// offered. Both open the order's full detail on press.

const money = (n: number) => `RD$${n.toFixed(2)}`;

// The merchant cares where the order stands in THEIR pipeline first, then in the street.
// Exported so the order-details screen wears the same chip.
export function statusOf(o: Order): { label: string; color: string } {
  if (o.status === 'CANCELLED') return { label: 'Cancelado', color: '#dc2626' };
  switch (o.deliveryStatus) {
    case 'DELIVERED': return { label: 'Entregado', color: '#16a34a' };
    case 'IN_TRANSIT': return { label: 'En camino', color: '#0ea5e9' };
    case 'ASSIGNED': return { label: 'Repartidor asignado', color: '#2563eb' };
    case 'FAILED': return { label: 'Entrega fallida', color: '#dc2626' };
    case 'RETURNED': return { label: 'Devuelto', color: '#dc2626' };
  }
  switch (o.status) {
    case 'PENDING': return { label: 'Nuevo', color: '#d97706' };
    case 'CONFIRMED': return { label: 'Confirmado', color: '#2563eb' };
    case 'PREPARING': return { label: 'En preparación', color: '#7c3aed' };
    case 'READY': return { label: 'Listo · buscando repartidor', color: '#7c3aed' };
    case 'DELIVERED': return { label: 'Entregado', color: '#16a34a' };
  }
  return { label: o.status, color: '#64748b' };
}

export function MerchantOrderCard({ order, busy = false, onOpen, onAct }: {
  order: Order;
  busy?: boolean;
  onOpen: (id: string) => void;
  // The counter's quick actions. Omitted on the history screen, where every order has already
  // finished and none of the transitions apply.
  onAct?: (id: string, fn: (id: string) => Promise<api.ApiResponse<Order>>) => void;
}) {
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

      <Text style={styles.items} numberOfLines={3}>
        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
      </Text>
      {order.notes ? <Text style={styles.notes} numberOfLines={2}>📝 {order.notes}</Text> : null}

      <View style={styles.totalRow}>
        <Text style={styles.total}>{money(order.total)}</Text>
        {order.deliveryFee != null ? (
          <Text style={styles.fee}>+ envío {money(order.deliveryFee)}</Text>
        ) : null}
      </View>

      {/* The counter's actions, mirroring the web: accept or reject a new order, then release it
          to the driver pool once the bag is packed. */}
      {onAct == null ? null : order.status === 'PENDING' ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.confirm, busy && styles.disabled]}
            disabled={busy}
            onPress={() => onAct(order.id, api.confirmMerchantOrder)}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Confirmar</Text>}
          </Pressable>
          <Pressable
            style={[styles.action, styles.reject, busy && styles.disabled]}
            disabled={busy}
            onPress={() => onAct(order.id, api.rejectMerchantOrder)}
          >
            <Text style={styles.actionText}>Rechazar</Text>
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
            {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.actionText, styles.readyText]}>Listo para recoger</Text>}
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirm: { backgroundColor: '#16a34a' },
  ready: { backgroundColor: t.accent },
  reject: { backgroundColor: '#dc2626' },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // On the near-white accent button, white ink would vanish.
  readyText: { color: t.onAccent },
  disabled: { opacity: 0.6 },
});
