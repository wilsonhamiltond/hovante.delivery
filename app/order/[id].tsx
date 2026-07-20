import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import type { OrderTracking } from '../../src/api';

const RED = '#FA0050';
const money = (n: number) => `RD$${n.toFixed(2)}`;

// Tracking timeline stages, keyed by the delivery status. The number is how far along the order is.
// AWAITING_MERCHANT (the merchant has not yet released it) sits at the first stage, like PENDING.
const STAGE: Record<string, number> = { AWAITING_MERCHANT: 0, PENDING: 0, ASSIGNED: 1, IN_TRANSIT: 2, DELIVERED: 3 };
const STAGES = [
  { title: 'Pedido realizado', sub: 'El comercio recibió tu pedido' },
  { title: 'Repartidor asignado', sub: 'Un repartidor tomó tu pedido' },
  { title: 'En camino', sub: 'Tu pedido va hacia ti' },
  { title: 'Entregado', sub: 'Disfruta tu pedido' },
];

// Big headline per status.
const HEADLINE: Record<string, string> = {
  AWAITING_MERCHANT: 'Esperando confirmación del comercio…',
  PENDING: 'Buscando repartidor…',
  ASSIGNED: 'Repartidor asignado',
  IN_TRANSIT: 'Tu pedido va en camino',
  DELIVERED: '¡Pedido entregado! 🎉',
  FAILED: 'Entrega fallida',
  RETURNED: 'Pedido devuelto',
  CANCELLED: 'Pedido cancelado',
};

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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header onBack={() => router.replace('/orders')} />
        <View style={styles.center}><Text style={styles.error}>{error ?? 'Pedido no encontrado.'}</Text></View>
      </SafeAreaView>
    );
  }

  const { order, deliveryStatus, driverName, deliveryCode } = data;
  const status = deliveryStatus ?? 'PENDING';
  const current = STAGE[status] ?? 0;
  const failed = status === 'FAILED' || status === 'CANCELLED' || status === 'RETURNED';
  // Show the confirmation code until the order is delivered (or terminal): the customer reads it to
  // the driver at the door to confirm receipt.
  const showCode = !!deliveryCode && status !== 'DELIVERED' && !failed;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header onBack={() => router.replace('/orders')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        <Text style={[styles.headline, failed && { color: '#dc2626' }]}>{HEADLINE[status] ?? status}</Text>
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
              const active = i === current;
              return (
                <View key={s.title} style={styles.stageRow}>
                  <View style={styles.stageMarker}>
                    <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                      {done && !active ? <Text style={styles.dotCheck}>✓</Text> : null}
                    </View>
                    {i < STAGES.length - 1 ? <View style={[styles.rail, i < current && styles.railDone]} /> : null}
                  </View>
                  <View style={styles.stageText}>
                    <Text style={[styles.stageTitle, done && styles.stageTitleDone]}>{s.title}</Text>
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
          <Text style={styles.value}>{order.address ?? 'Sin dirección'}</Text>
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
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(order.total)}</Text></View>
        </View>

        <Pressable style={styles.secondary} onPress={() => router.replace('/orders')}>
          <Text style={styles.secondaryText}>Ver mis pedidos</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={8}><Text style={styles.back} numberOfLines={1}>‹ Pedidos</Text></Pressable>
      <Text style={styles.title}>Seguimiento</Text>
      <View style={{ width: 90 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  back: { color: RED, fontWeight: '700', fontSize: 16, width: 90 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#111827' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  scroll: { padding: 16 },
  orderNumber: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  headline: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 4 },
  driver: { fontSize: 14, color: '#374151', marginTop: 6, fontWeight: '600' },

  codeCard: { backgroundColor: '#111827', borderRadius: 16, padding: 18, marginTop: 16, alignItems: 'center' },
  codeLabel: { fontSize: 12, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 12, marginTop: 6, marginLeft: 12 },
  codeHint: { fontSize: 13, color: '#d1d5db', marginTop: 6, textAlign: 'center' },

  timeline: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginTop: 16 },
  stageRow: { flexDirection: 'row', gap: 12 },
  stageMarker: { alignItems: 'center', width: 24 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: RED },
  dotActive: { backgroundColor: '#fff', borderWidth: 3, borderColor: RED },
  dotCheck: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rail: { width: 3, flex: 1, minHeight: 28, backgroundColor: '#e5e7eb', marginVertical: 2 },
  railDone: { backgroundColor: RED },
  stageText: { flex: 1, paddingBottom: 18 },
  stageTitle: { fontSize: 15, fontWeight: '700', color: '#9ca3af' },
  stageTitleDone: { color: '#111827' },
  stageSub: { fontSize: 13, color: '#9ca3af', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#9ca3af', marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 15, color: '#111827', marginTop: 3, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  lineQty: { fontSize: 14, fontWeight: '800', color: RED, minWidth: 26 },
  lineName: { flex: 1, fontSize: 15, color: '#111827' },
  linePrice: { fontSize: 14, fontWeight: '700', color: '#111827' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#374151' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#111827' },

  secondary: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: '#ffd6e4' },
  secondaryText: { color: RED, fontSize: 16, fontWeight: '800' },
});
