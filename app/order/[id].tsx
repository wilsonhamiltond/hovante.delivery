import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import type { Order, OrderTracking } from '../../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { orderStatusChip } from '../../src/orderStatus';
import { queueRemainingMin } from '../../src/orderQueue';

const money = (n: number) => `RD$${n.toFixed(2)}`;

// Tracking timeline, in order. It spans the merchant's order status (confirmar → listo) and then the
// delivery status (asignada → en camino → entregada), so the customer sees the whole journey.
const STAGES = [
  { title: 'Pedido realizado', sub: 'El comercio recibió tu pedido' },
  { title: 'Pedido confirmado', sub: 'El comercio aceptó tu pedido' },
  { title: 'Listo para recoger', sub: 'El comercio preparó tu pedido' },
  { title: 'Repartidor asignado', sub: 'Un repartidor tomó tu pedido' },
  { title: 'En camino', sub: 'Tu pedido va hacia ti' },
  { title: 'Entregado', sub: 'Disfruta tu pedido' },
];

// Big headline per phase (same index as STAGES).
const HEADLINE_BY_PHASE = [
  'Esperando confirmación del comercio…',
  'Pedido confirmado',
  'Listo, buscando repartidor…',
  'Repartidor asignado',
  'Tu pedido va en camino',
  '¡Pedido entregado! 🎉',
];

// A short "12 jul, 03:45 p. m." style stamp for a status change; null when the step isn't reached.
const fmtStamp = (iso?: string | null): string | null =>
  iso ? new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

// The current phase index. The delivery status wins once a driver is involved; before that (the
// delivery is still AWAITING_MERCHANT/PENDING) the merchant's order status drives it.
function currentPhase(orderStatus: string, deliveryStatus: string | null): number {
  if (deliveryStatus === 'DELIVERED') return 5;
  if (deliveryStatus === 'IN_TRANSIT') return 4;
  if (deliveryStatus === 'ASSIGNED') return 3;
  if (orderStatus === 'READY') return 2;
  if (orderStatus === 'CONFIRMED') return 1;
  return 0;
}

export default function OrderTrackingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await api.orderTracking(id);
    if (res.success) { setData(res.data); setError(null); }
    else setError(res.message);
  }, [id]);

  // Refresh on focus and poll while open, so the status advances as the driver progresses.
  useFocusEffect(useCallback(() => {
    let active = true;
    load().finally(() => { if (active) setLoading(false); });
    const timer = setInterval(load, 8000);
    return () => { active = false; clearInterval(timer); };
  }, [load]));


  if (loading) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!data) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onBack={() => router.replace('/orders')} />
        <View style={styles.center}><Text style={styles.error}>{error ?? 'Pedido no encontrado.'}</Text></View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  const { order, deliveryStatus, driverName, deliveryCode } = data;
  const failed = order.status === 'CANCELLED'
    || deliveryStatus === 'FAILED' || deliveryStatus === 'CANCELLED' || deliveryStatus === 'RETURNED';
  const current = currentPhase(order.status, deliveryStatus);
  // The hollow "you are here" ring belongs to a journey still moving. Once the last stage is
  // reached the order IS delivered -- a fact with its own timestamp, not a step still pending --
  // so that stage fills and checks like every one before it.
  const journeyComplete = current >= STAGES.length - 1;
  // A timestamp per timeline step, in STAGES order, so each reached stage shows when it happened.
  const phaseStamps = [data.placedAt, data.confirmedAt, data.readyAt, data.assignedAt, data.inTransitAt, data.deliveredAt];
  const headline = failed
    ? (order.status === 'CANCELLED' ? 'Pedido cancelado' : deliveryStatus === 'FAILED' ? 'Entrega fallida' : 'Pedido devuelto')
    : HEADLINE_BY_PHASE[current];
  // Show the confirmation code until the order is delivered (or terminal): the customer reads it to
  // the driver at the door to confirm receipt.
  const showCode = !!deliveryCode && deliveryStatus !== 'DELIVERED' && !failed;

  // The queue the merchant declared when they accepted: the order waits its turn before they start
  // preparing it. Until that runs out nobody has cooked, packed or ridden anything, so the customer
  // can still take it back -- and the wait itself is worth saying out loud rather than leaving them
  // staring at "confirmado" wondering whether anything is happening.
  // The tracking payload carries the timestamps beside the order rather than on it, so the order
  // is completed with them before asking the shared helpers anything.
  const stated: Order = {
    ...order,
    deliveryStatus: order.deliveryStatus ?? deliveryStatus,
    confirmedAt: order.confirmedAt ?? data.confirmedAt,
  };
  const queueMinutesLeft = queueRemainingMin(stated);
  const inQueue = queueMinutesLeft != null && queueMinutesLeft > 0;

  // Cancellable while nobody has started on it: before the merchant confirms, and for as long as
  // the queue they declared still runs. The server re-checks both, so a window closing mid-tap is
  // refused there rather than half-applied here.
  const canCancel = !failed && (order.status === 'PENDING' || inQueue);

  // Same wording as the orders list and the home cards -- one order should never read as two
  // different states in two places.
  const statusChip = orderStatusChip(stated);

  // Shows where this order is going, in the app. The map geocodes the address when the order has
  // no pin (older orders placed before the location step captured one).
  const openMap = () => router.push({
    pathname: '/map',
    params: {
      ...(order.latitude != null ? { lat: String(order.latitude) } : {}),
      ...(order.longitude != null ? { lng: String(order.longitude) } : {}),
      ...(order.address ? { address: order.address } : {}),
      title: 'Entregar en',
    },
  });

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header onBack={() => router.replace('/orders')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.numberRow}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          {/* The current state, said outright. The queue wins while it runs: "confirmado" alone
              leaves the customer wondering whether anything is actually happening. */}
          <View style={[styles.statusChip, { backgroundColor: statusChip.color }]}>
            <Text style={styles.statusChipText}>{statusChip.label}</Text>
          </View>
        </View>
        <Text style={[styles.headline, failed && { color: t.danger }]}>{headline}</Text>
        {inQueue ? (
          <Text style={styles.queueNote}>
            El comercio empezará a prepararlo en unos {queueMinutesLeft} min. Puedes cancelarlo mientras tanto.
          </Text>
        ) : null}
        {driverName ? <Text style={styles.driver}>Repartidor: {driverName}</Text> : null}

        {/* Delivery confirmation code: the customer reads it to the driver at the door. */}
        {showCode ? (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Código de entrega</Text>
            <Text style={styles.codeValue}>{deliveryCode}</Text>
            <Text style={styles.codeHint}>Dáselo al repartidor al recibir tu pedido</Text>
          </View>
        ) : null}

        {/* Status timeline */}
        {!failed ? (
          <View style={styles.timeline}>
            {STAGES.map((s, i) => {
              const done = i <= current;
              const active = i === current && !journeyComplete;
              return (
                <View key={s.title} style={styles.stageRow}>
                  <View style={styles.stageMarker}>
                    <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                      {done && !active ? <Text style={styles.dotCheck}>✓</Text> : null}
                    </View>
                    {i < STAGES.length - 1 ? <View style={[styles.rail, i < current && styles.railDone]} /> : null}
                  </View>
                  <View style={styles.stageText}>
                    <View style={styles.stageTitleRow}>
                      <Text style={[styles.stageTitle, done && styles.stageTitleDone]}>{s.title}</Text>
                      {fmtStamp(phaseStamps[i]) ? <Text style={styles.stageDate}>{fmtStamp(phaseStamps[i])}</Text> : null}
                    </View>
                    <Text style={styles.stageSub}>{s.sub}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Order details */}
        <View style={styles.card}>
          <Text style={styles.label}>Comercio</Text>
          <Text style={styles.value}>{order.merchantName}</Text>
          <Text style={styles.label}>Entregar en</Text>
          <View style={styles.addressRow}>
            <Text style={[styles.value, { flex: 1 }]}>{order.address ?? 'Sin dirección'}</Text>
            {order.address || order.latitude != null ? (
              <Pressable style={styles.mapBtn} onPress={openMap} accessibilityRole="button">
                <Text style={styles.mapBtnText}>🗺️ Mapa</Text>
              </Pressable>
            ) : null}
          </View>
          {deliveryCode ? (<><Text style={styles.label}>Código de entrega</Text><Text style={styles.value}>{deliveryCode}</Text></>) : null}
          {order.notes ? (<><Text style={styles.label}>Nota</Text><Text style={styles.value}>{order.notes}</Text></>) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Productos</Text>
          {order.items.map((it) => (
            <View key={it.id} style={styles.line}>
              <Text style={styles.lineQty}>{it.quantity}×</Text>
              <Text style={styles.lineName} numberOfLines={1}>{it.name}</Text>
              <Text style={styles.linePrice}>{money(it.lineTotal)}</Text>
            </View>
          ))}
          {order.deliveryFee != null ? (
            <>
              {/* With a delivery charge the breakdown is spelled out; without one (older orders)
                  the single products total stays as it always was. */}
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.subValue}>{money(order.total)}</Text></View>
              <View style={styles.subRow}><Text style={styles.totalLabel}>Envío</Text><Text style={styles.subValue}>{money(order.deliveryFee)}</Text></View>
              <View style={styles.subRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(order.total + order.deliveryFee)}</Text></View>
            </>
          ) : (
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(order.total)}</Text></View>
          )}
        </View>

        {/* The reason the customer gave when cancelling, echoed back once the order is cancelled. */}
        {order.status === 'CANCELLED' && order.cancelReason ? (
          <Text style={styles.cancelReason}>Motivo: {order.cancelReason}</Text>
        ) : null}

        {/* Cancel: only while the merchant has not confirmed (PENDING). Opens the cancel screen,
            which collects the reason before anything happens; the moment the merchant confirms,
            the button disappears on the next poll and the server refuses stragglers anyway. */}
        {canCancel ? (
          <Pressable style={styles.cancelBtn} onPress={() => router.push(`/cancel-order/${order.id}`)}>
            <Text style={styles.cancelBtnText}>Cancelar pedido</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.secondary} onPress={() => router.replace('/orders')}>
          <Text style={styles.secondaryText}>Ver mis pedidos</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
    </GradientBackground>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} label="Pedidos" />
      <Text style={styles.title}>Seguimiento</Text>
      <View style={{ width: BACK_BUTTON_WIDTH }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },
  scroll: { padding: 16 },
  numberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  orderNumber: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '65%' },
  statusChipText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  queueNote: { fontSize: 14, color: t.textMuted, fontWeight: '600', lineHeight: 20, marginTop: 6 },
  headline: { fontSize: 24, fontWeight: '800', color: t.text, marginTop: 4 },
  driver: { fontSize: 14, color: t.textMuted, marginTop: 6, fontWeight: '600' },

  codeCard: { backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 18, marginTop: 16, alignItems: 'center' },
  codeLabel: { fontSize: 12, fontWeight: '800', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 40, fontWeight: '900', color: t.text, letterSpacing: 12, marginTop: 6, marginLeft: 12 },
  codeHint: { fontSize: 13, color: t.textMuted, marginTop: 6, textAlign: 'center' },

  timeline: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 18, marginTop: 16 },
  stageRow: { flexDirection: 'row', gap: 12 },
  stageMarker: { alignItems: 'center', width: 24 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: t.accent },
  dotActive: { backgroundColor: 'transparent', borderWidth: 3, borderColor: t.accent },
  dotCheck: { color: t.onAccent, fontSize: 12, fontWeight: '800' },
  rail: { width: 3, flex: 1, minHeight: 28, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 2 },
  railDone: { backgroundColor: t.accent },
  stageText: { flex: 1, paddingBottom: 18 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stageTitle: { fontSize: 15, fontWeight: '700', color: t.textFaint, flexShrink: 1 },
  stageTitleDone: { color: t.text },
  stageDate: { fontSize: 12, color: t.textMuted, fontWeight: '600' },
  stageSub: { fontSize: 13, color: t.textMuted, marginTop: 2 },

  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 16, marginTop: 14 },
  label: { fontSize: 12, fontWeight: '700', color: t.textMuted, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 15, color: t.text, marginTop: 3, fontWeight: '600' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // Matches the driver screen's pill buttons.
  mapBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 3 },
  mapBtnText: { color: t.text, fontWeight: '700', fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  lineQty: { fontSize: 14, fontWeight: '800', color: t.text, minWidth: 26 },
  lineName: { flex: 1, fontSize: 15, color: t.text },
  linePrice: { fontSize: 14, fontWeight: '700', color: t.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: t.textMuted },
  subValue: { fontSize: 15, fontWeight: '700', color: t.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: t.text },

  secondary: { backgroundColor: t.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: t.border },
  secondaryText: { color: t.text, fontSize: 16, fontWeight: '800' },

  cancelBtn: { marginTop: 16, borderWidth: 1, borderColor: 'rgba(252,165,165,0.6)', backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { color: '#fecaca', fontSize: 16, fontWeight: '800' },
  cancelReason: { marginTop: 12, color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
