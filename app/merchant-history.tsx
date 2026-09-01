import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Order } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { MerchantTopBar } from '../src/MerchantTopBar';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';
import { MerchantOrderCard } from '../src/MerchantOrderCard';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    title: string;
    empty: string;
  }
> = {
  es: {
    title: 'Historial de pedidos',
    empty: 'Aún no tienes pedidos terminados.',
  },
  en: {
    title: 'Order history',
    empty: 'You have no finished orders yet.',
  },
  fr: {
    title: 'Historique des commandes',
    empty: 'Vous n’avez pas encore de commandes terminées.',
  },
};

// The merchant's finished orders (delivered, rejected, failed) as an infinite scroll: the first 10
// arrive with the screen, and each time the end comes into view the next page is appended. The
// counter's queue is the home screen instead, so nothing is listed twice.

// How many history rows each page brings; the list asks for the next page as the end scrolls near.
const HISTORY_PAGE = 10;

export default function MerchantHistoryScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    const res = await api.merchantOrderHistory(0, HISTORY_PAGE);
    if (!res.success) { setError(res.message); return; }
    setError(null);
    const rows = res.data ?? [];
    setOrders(rows);
    // A short page means the history is exhausted; a full one may have more behind it.
    setHasMore(rows.length === HISTORY_PAGE);
  }, []);

  // Reloaded on every focus rather than polled: an order only lands here once it has finished, so
  // coming back to the tab is the moment worth re-reading.
  useFocusEffect(useCallback(() => {
    let alive = true;
    loadFirstPage().finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [loadFirstPage]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const res = await api.merchantOrderHistory(orders.length, HISTORY_PAGE);
    setLoadingMore(false);
    if (!res.success) return;
    const rows = res.data ?? [];
    // Deduped by id: an order finishing between pages shifts the offsets, and appending a row the
    // list already shows would crash the keyExtractor.
    setOrders((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setHasMore(rows.length === HISTORY_PAGE);
  };

  const open = (id: string) => router.push(`/merchant-order/${id}`);

  return (
    <GradientBackground>
    <View style={styles.safe}>
      {/* The same "🏪 comercio" bar the home wears; the top safe area rides inside it. */}
      <MerchantTopBar />
      <View style={styles.header}>
        <Text style={styles.title}>{tx.title}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          // No onAct: every order here has already finished, so the counter's actions do not apply.
          renderItem={({ item }) => <MerchantOrderCard order={item} onOpen={open} />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>{tx.empty}</Text>}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={t.text} /> : null
          }
        />
      )}

      <BottomNav active="history" variant="merchant" />
    </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  footerSpinner: { marginVertical: 14 },
});
