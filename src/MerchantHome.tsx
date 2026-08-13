import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Order } from './api';
import { GradientBackground, t } from './theme';
import { BottomNav } from './BottomNav';
import { MerchantOrderCard } from './MerchantOrderCard';
import { QueueTimeModal } from './QueueTimeModal';

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
  // The order being accepted: confirming goes through the queue-time modal, which asks how long
  // it will wait before preparation starts, and only then calls the API.
  const [confirming, setConfirming] = useState<Order | null>(null);

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
    if (!res.success) { setError(res.message); return false; }
    // Confirming keeps the order in the queue; rejecting drops it out of this list and into the
    // history, which is exactly what the reload shows.
    await load();
    return true;
  };

  const open = (id: string) => router.push(`/merchant-order/${id}`);

  // Only a successful confirm closes the modal: on failure it stays put, so the choice is not lost
  // while the error shows at the top of the list.
  const confirmWithQueue = async (queueMinutes: number) => {
    if (!confirming) return;
    const ok = await act(confirming.id, (i) => api.confirmMerchantOrder(i, queueMinutes));
    if (ok) setConfirming(null);
  };

  const companyName = profile?.merchantCompanyName ?? 'Tu comercio';

  // The queue split by whether the counter has taken the order on: accepted ones ("En marcha" --
  // queued, preparing, or out looking for a driver) above, the new ones still awaiting a yes/no
  // below. The work in hand outranks the doorbell: it is what the counter keeps glancing at.
  const working = orders.filter((o) => o.status !== 'PENDING');
  const fresh = orders.filter((o) => o.status === 'PENDING');

  const renderCard = (item: Order) => (
    <MerchantOrderCard
      order={item}
      busy={busyId === item.id}
      onOpen={open}
      onAct={act}
      onConfirm={(id) => { setError(null); setConfirming(orders.find((o) => o.id === id) ?? null); }}
      onTrackDriver={(id) => router.push(`/merchant-driver-map/${id}`)}
    />
  );

  return (
    <GradientBackground>
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <Text style={styles.hello} numberOfLines={1}>🏪 {companyName}</Text>
          <Text style={styles.subtitle}>
            {orders.length === 0
              ? 'Sin pedidos en curso'
              : `${fresh.length} nuevo(s) · ${working.length} en marcha`}
          </Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          // The new orders are the scrolling list; the work in hand rides above them as the
          // header, so it is what the screen opens on.
          data={fresh}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {orders.length === 0 ? (
                <Text style={styles.empty}>
                  Nada pendiente en el mostrador. Los pedidos ya terminados están en Historial.
                </Text>
              ) : (
                <>
                  {working.length > 0 ? (
                    <>
                      <Text style={styles.sectionTitle}>En marcha</Text>
                      {working.map((o) => <View key={o.id}>{renderCard(o)}</View>)}
                    </>
                  ) : null}
                  {/* The title only when something is under it: an empty "Nuevos" heading would
                      read as orders failing to load rather than none having arrived. */}
                  {fresh.length > 0 ? <Text style={styles.sectionTitle}>Nuevos</Text> : null}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => renderCard(item)}
        />
      )}

      <QueueTimeModal
        visible={confirming != null}
        orderNumber={confirming?.orderNumber ?? null}
        busy={busyId === confirming?.id}
        error={error}
        onConfirm={confirmWithQueue}
        onClose={() => setConfirming(null)}
      />

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
  headerBlock: { gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.textMuted, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 4 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
