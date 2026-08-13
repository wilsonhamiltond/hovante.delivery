import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Order } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';
import { orderStatusChip } from '../src/orderStatus';

const money = (n: number) => `RD$${n.toFixed(2)}`;

// How many history rows each page brings; the list asks for the next page as the end scrolls near.
const HISTORY_PAGE = 10;

// The card's chip comes from orderStatus.ts, shared with the home carousel, the Explorar row
// and the tracking screen, so one order never reads as two different states in two places.

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const s = orderStatusChip(order);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
      </View>
      <Text style={styles.merchant}>{order.merchantName}</Text>
      <Text style={styles.items} numberOfLines={2}>
        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
      </Text>
      <View style={styles.cardBottom}>
        <View>
          {/* Grand total (products + envío); the fee spelled out above it so the number is
              explained. Orders without a stored fee show the products total alone. */}
          {order.deliveryFee != null ? (
            <Text style={styles.fee}>Envío {money(order.deliveryFee)}</Text>
          ) : null}
          <Text style={styles.total}>{money(order.total + (order.deliveryFee ?? 0))}</Text>
        </View>
        <Text style={styles.track}>Seguir ›</Text>
      </View>
    </Pressable>
  );
}

// Active orders on top, then the finished ones ("Historial") as an infinite scroll: the first 10
// arrive with the screen, and each time the end comes into view the next page is appended.
export default function OrdersScreen() {
  const router = useRouter();
  const [active, setActive] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback(async () => {
    const [act, hist] = await Promise.all([api.myOrders(), api.myOrderHistory(0, HISTORY_PAGE)]);
    if (act.success) setActive(act.data ?? []);
    if (hist.success) {
      const rows = hist.data ?? [];
      setHistory(rows);
      // A short page means the history is exhausted; a full one may have more behind it.
      setHasMore(rows.length === HISTORY_PAGE);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadInitial().finally(() => alive && setLoading(false));
      return () => { alive = false; };
    }, [loadInitial]),
  );

  const loadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const res = await api.myOrderHistory(history.length, HISTORY_PAGE);
    setLoadingMore(false);
    if (!res.success) return;
    const rows = res.data ?? [];
    // Deduped by id: an order finishing between pages shifts the offsets, and appending a row
    // the list already shows would crash the keyExtractor.
    setHistory((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setHasMore(rows.length === HISTORY_PAGE);
  };

  const open = (id: string) => router.push(`/order/${id}`);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis pedidos</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <OrderCard order={item} onPress={() => open(item.id)} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {active.length === 0 && history.length === 0 ? (
                <Text style={styles.empty}>Aún no tienes pedidos.</Text>
              ) : (
                <>
                  {active.length > 0 ? (
                    <>
                      <Text style={styles.sectionTitle}>En curso</Text>
                      {active.map((o) => <OrderCard key={o.id} order={o} onPress={() => open(o.id)} />)}
                    </>
                  ) : null}
                  <Text style={styles.sectionTitle}>Historial</Text>
                  {history.length === 0 ? (
                    <Text style={styles.empty}>Sin pedidos anteriores.</Text>
                  ) : null}
                </>
              )}
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={t.text} /> : null
          }
        />
      )}
      <BottomNav active="orders" />
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  headerBlock: { gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.textMuted, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 4 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 24 },
  footerSpinner: { marginVertical: 14 },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: t.text },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  merchant: { fontSize: 14, fontWeight: '700', color: t.text, marginTop: 8 },
  items: { fontSize: 13, color: t.textMuted, marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  fee: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  total: { fontSize: 16, fontWeight: '800', color: t.text },
  track: { fontSize: 14, fontWeight: '800', color: t.text },
});
