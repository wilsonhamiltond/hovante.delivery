import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Order } from './api';
import { GradientBackground, t } from './theme';
import { BottomNav } from './BottomNav';
import { MerchantOrderCard } from './MerchantOrderCard';

// The merchant's phone view: the counter's queue -- the orders still to be dealt with -- with the
// same accept/release/reject actions the web back office has, so a shopkeeper can run the counter
// from a phone. Finished orders are not here at all; they live on the Historial tab. All order
// reads and actions are scoped server-side by the token's company claim.

export function MerchantHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The order an action is running on, so only its buttons show a spinner.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.merchantOrders(true);
    if (!res.success) { setError(res.message); return; }
    setError(null);
    setOrders(res.data ?? []);
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => alive && setLoading(false));
    // New orders arrive while the screen sits on the counter, so it polls itself.
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const act = async (id: string, fn: (id: string) => Promise<api.ApiResponse<Order>>) => {
    setBusyId(id);
    setError(null);
    const res = await fn(id);
    setBusyId(null);
    if (!res.success) { setError(res.message); return; }
    // Confirming keeps the order in the queue; rejecting drops it out of this list and into the
    // history, which is exactly what the reload shows.
    await load();
  };

  const open = (id: string) => router.push(`/merchant-order/${id}`);

  const companyName = profile?.merchantCompanyName ?? 'Tu comercio';

  return (
    <GradientBackground>
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <Text style={styles.hello} numberOfLines={1}>🏪 {companyName}</Text>
          <Text style={styles.subtitle}>
            {orders.length > 0 ? `${orders.length} pedido(s) en curso` : 'Sin pedidos en curso'}
          </Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nada pendiente en el mostrador. Los pedidos ya terminados están en Historial.
            </Text>
          }
          renderItem={({ item }) => (
            <MerchantOrderCard order={item} busy={busyId === item.id} onOpen={open} onAct={act} />
          )}
        />
      )}

      <BottomNav active="home" variant="merchant" />
    </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  headerSafe: { backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  hello: { fontSize: 22, fontWeight: '900', color: t.text },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 2, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 86 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
