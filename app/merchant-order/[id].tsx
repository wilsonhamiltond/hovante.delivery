import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import type { Order } from '../../src/api';
import { statusOf } from '../../src/MerchantOrderCard';
import { QueueTimeModal } from '../../src/QueueTimeModal';
import { PointsMap } from '../../src/PointsMap';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';

const money = (n: number) => `RD$${n.toFixed(2)}`;

const fmtStamp = (iso?: string | null): string | null =>
  iso ? new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

// "hace 2 min" -- how fresh the driver's reported position is, so the pin is trusted exactly as
// much as it deserves.
function agoText(iso?: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  return `hace ${hours} h ${mins % 60} min`;
}

// One order, the merchant's whole view of it: who ordered, where it goes, every line with its
// price, the money, the invoice once issued -- and the pipeline actions the status allows.
// Loaded from the same company-scoped list the home uses, so no extra endpoint is needed.
export default function MerchantOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The reject flow: an inline "¿seguro?" step rather than Alert (whose buttons do not render on web).
  const [confirmReject, setConfirmReject] = useState(false);
  // The confirm flow goes through the queue-time modal: it asks how long the order will wait
  // before preparation starts, and only then calls the API.
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    const res = await api.merchantOrders();
    if (!res.success) { setError(res.message); return; }
    setError(null);
    setOrder((res.data ?? []).find((o) => o.id === id) ?? null);
  }, [id]);

  // Refresh on focus and poll while open, so the street side (driver, delivery) advances live.
  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => alive && setLoading(false));
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [load]));

  const act = async (fn: (id: string) => Promise<api.ApiResponse<Order>>) => {
    if (!order) return false;
    setBusy(true);
    setError(null);
    const res = await fn(order.id);
    setBusy(false);
    setConfirmReject(false);
    if (!res.success) { setError(res.message); return false; }
    await load();
    return true;
  };

  // Only a successful confirm closes the modal: on failure it stays put with the error inside it,
  // so the chosen time is not lost.
  const confirmWithQueue = async (queueMinutes: number) => {
    const ok = await act((i) => api.confirmMerchantOrder(i, queueMinutes));
    if (ok) setConfirming(false);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (loading) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View></SafeAreaView>
      </GradientBackground>
    );
  }
  if (!order) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title="Pedido" onBack={back} />
        <View style={styles.center}><Text style={styles.muted}>{error ?? 'Pedido no encontrado.'}</Text></View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  const s = statusOf(order);
  const grandTotal = order.total + (order.deliveryFee ?? 0);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title={order.orderNumber} onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.rowBetween}>
          <Text style={styles.placedAt}>{fmtStamp(order.createdAt) ?? ''}</Text>
          <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
        </View>

        {/* The promise made at confirm, spelled out under the live chip (which counts it down and
            flips to "En preparación" when it runs out). */}
        {order.queueMinutes != null && order.status === 'CONFIRMED' ? (
          <Text style={styles.queue}>
            ⏱️ {order.queueMinutes === 0
              ? 'Se prometió empezar de inmediato'
              : `Se prometió empezar en ${order.queueMinutes} min`}
          </Text>
        ) : null}

        {/* The customer: who receives it and how to reach them. */}
        <View style={styles.card}>
          <Text style={styles.label}>Cliente</Text>
          <View style={styles.clientRow}>
            <Text style={styles.clientName} numberOfLines={1}>👤 {order.customerName ?? 'Cliente'}</Text>
            {order.customerPhone ? (
              <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
                <Text style={styles.callText}>📞 {order.customerPhone}</Text>
              </Pressable>
            ) : null}
          </View>
          {order.address ? <Text style={styles.address}>📍 {order.address}</Text> : null}
          {order.latitude != null && order.longitude != null ? (
            <Pressable
              style={styles.mapBtn}
              onPress={() => router.push({
                pathname: '/map',
                params: {
                  lat: String(order.latitude), lng: String(order.longitude),
                  ...(order.address ? { address: order.address } : {}),
                  title: order.customerName ?? 'Entregar',
                },
              })}
            >
              <Text style={styles.mapBtnText}>🗺️ Ver en el mapa</Text>
            </Pressable>
          ) : null}
        </View>

        {/* The driver, once one has claimed the delivery: who is coming to the counter and how to
            ring them about the handover. Hidden while the order is still looking for one. */}
        {order.driverName || order.driverPhone ? (
          <View style={styles.card}>
            <Text style={styles.label}>Repartidor</Text>
            <View style={styles.clientRow}>
              <Text style={styles.clientName} numberOfLines={1}>🛵 {order.driverName ?? 'Repartidor'}</Text>
              {order.driverPhone ? (
                <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.driverPhone}`)}>
                  <Text style={styles.callText}>📞 {order.driverPhone}</Text>
                </Pressable>
              ) : null}
            </View>
            {order.deliveryStatus === 'IN_TRANSIT' ? (
              <Text style={styles.driverState}>Va en camino con el pedido.</Text>
            ) : order.deliveryStatus === 'ASSIGNED' ? (
              <Text style={styles.driverState}>Viene hacia el comercio a recoger.</Text>
            ) : null}

            {/* Where the driver actually is: their last reported fix as the bike, with the
                delivery destination pinned for reference. The screen's 15 s poll keeps the pin
                moving; the caption says how fresh the fix is so it is trusted accordingly. */}
            {order.driverLatitude != null && order.driverLongitude != null ? (
              <>
                <View style={styles.driverMap}>
                  <PointsMap
                    // Keyed by the fix so each report rebuilds the map on the new position.
                    key={`${order.driverLatitude},${order.driverLongitude}`}
                    points={order.latitude != null && order.longitude != null ? [{
                      lat: order.latitude, lng: order.longitude, address: order.address ?? null,
                      label: '2', title: order.customerName ?? 'Entregar', color: '#16a34a',
                    }] : []}
                    driver={{ lat: order.driverLatitude, lng: order.driverLongitude }}
                  />
                </View>
                {agoText(order.driverPositionAt) ? (
                  <Text style={styles.driverState}>Ubicación reportada {agoText(order.driverPositionAt)}.</Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {/* Every line with its price -- what the counter packs and charges. */}
        <View style={styles.card}>
          <Text style={styles.label}>Productos</Text>
          {order.items.map((li) => (
            <View key={li.id} style={styles.line}>
              <Text style={styles.lineQty}>{li.quantity}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={2}>{li.name}</Text>
                <Text style={styles.lineUnit}>{money(li.unitPrice)} c/u</Text>
              </View>
              <Text style={styles.linePrice}>{money(li.lineTotal)}</Text>
            </View>
          ))}
          {order.notes ? <Text style={styles.notes}>📝 {order.notes}</Text> : null}

          <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.subValue}>{money(order.total)}</Text></View>
          {order.deliveryFee != null ? (
            <View style={styles.subRow}><Text style={styles.totalLabel}>Envío</Text><Text style={styles.subValue}>{money(order.deliveryFee)}</Text></View>
          ) : null}
          <View style={styles.subRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(grandTotal)}</Text></View>
        </View>

        {/* The invoice, once "Facturar" was pressed on the web. */}
        {order.documentNumber ? (
          <View style={styles.card}>
            <Text style={styles.label}>Factura</Text>
            <Text style={styles.invoice}>{order.documentNumber}{order.ncf ? ` · NCF ${order.ncf}` : ''}</Text>
          </View>
        ) : null}

        {order.status === 'CANCELLED' && order.cancelReason ? (
          <Text style={styles.cancelReason}>Motivo de cancelación: {order.cancelReason}</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* The pipeline, exactly what the status allows: accept or reject a new order; release a
            confirmed one to the driver pool once the bag is packed. Anything further along is the
            street's business and only reads here. */}
        {order.status === 'PENDING' && !confirmReject ? (
          <View style={styles.actions}>
            <Pressable style={[styles.action, styles.confirm, busy && styles.disabled]} disabled={busy} onPress={() => { setError(null); setConfirming(true); }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Confirmar pedido</Text>}
            </Pressable>
            <Pressable style={[styles.action, styles.reject, busy && styles.disabled]} disabled={busy} onPress={() => setConfirmReject(true)}>
              <Text style={styles.actionText}>Rechazar</Text>
            </Pressable>
          </View>
        ) : null}
        {order.status === 'PENDING' && confirmReject ? (
          <View style={styles.card}>
            <Text style={styles.rejectAsk}>¿Seguro que quieres rechazar este pedido?</Text>
            <View style={styles.actions}>
              <Pressable style={[styles.action, styles.reject, busy && styles.disabled]} disabled={busy} onPress={() => act(api.rejectMerchantOrder)}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Sí, rechazar</Text>}
              </Pressable>
              <Pressable style={[styles.action, styles.neutral]} disabled={busy} onPress={() => setConfirmReject(false)}>
                <Text style={styles.actionText}>No</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {order.status === 'CONFIRMED' || order.status === 'PREPARING' ? (
          <Pressable style={[styles.action, styles.ready, busy && styles.disabled]} disabled={busy} onPress={() => act(api.readyMerchantOrder)}>
            {/* The accent is near-white, so this button's ink is onAccent -- white on white was
                an invisible button. */}
            {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.actionText, styles.readyText]}>Listo para recoger</Text>}
          </Pressable>
        ) : null}
      </ScrollView>

      <QueueTimeModal
        visible={confirming}
        orderNumber={order.orderNumber}
        busy={busy}
        error={error}
        onConfirm={confirmWithQueue}
        onClose={() => setConfirming(false)}
      />
    </SafeAreaView>
    </GradientBackground>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <Text style={styles.title}>{title}</Text>
      <View style={{ width: BACK_BUTTON_WIDTH }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: t.textMuted },
  scroll: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placedAt: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  queue: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '65%' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, gap: 8 },
  label: { fontSize: 12, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientName: { flex: 1, fontSize: 16, fontWeight: '800', color: t.text },
  callBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  callText: { color: t.text, fontWeight: '700', fontSize: 12 },
  address: { fontSize: 14, color: t.textMuted },
  driverState: { fontSize: 13, color: t.textMuted, fontWeight: '600' },
  driverMap: { height: 200, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  mapBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  mapBtnText: { color: t.text, fontWeight: '800', fontSize: 14 },

  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineQty: { fontSize: 14, fontWeight: '800', color: t.text, minWidth: 30 },
  lineName: { fontSize: 14, fontWeight: '700', color: t.text },
  lineUnit: { fontSize: 12, color: t.textFaint, marginTop: 1 },
  linePrice: { fontSize: 14, fontWeight: '800', color: t.text },
  notes: { fontSize: 13, color: t.textMuted, fontStyle: 'italic' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  subValue: { fontSize: 14, fontWeight: '700', color: t.text },
  totalValue: { fontSize: 18, fontWeight: '900', color: t.text },
  invoice: { fontSize: 15, fontWeight: '700', color: t.text },
  cancelReason: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirm: { backgroundColor: '#16a34a' },
  ready: { backgroundColor: t.accent },
  reject: { backgroundColor: '#dc2626' },
  neutral: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // On the near-white accent button, white ink would vanish.
  readyText: { color: t.onAccent },
  rejectAsk: { color: t.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
