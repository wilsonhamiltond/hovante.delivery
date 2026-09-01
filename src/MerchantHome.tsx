import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from './api';
import type { Me, Order } from './api';
import { GradientBackground, t } from './theme';
import { MerchantTopBar } from './MerchantTopBar';
import { BottomNav } from './BottomNav';
import { MerchantOrderCard } from './MerchantOrderCard';
import { QueueTimeModal } from './QueueTimeModal';
import { clearAllNotifications, presentedNotificationCount } from './pushNotifications';
import { useStrings, type Locale } from './i18n';

const S: Record<
  Locale,
  {
    companyFallback: string;
    subtitle: (fresh: number, working: number) => string;
    markAllSeenLabel: string;
    markAllSeen: (count: number) => string;
    allClear: string;
    allClearBody: string;
    allClearHint: string;
    inProgress: string;
    fresh: string;
  }
> = {
  es: {
    companyFallback: 'Tu comercio',
    subtitle: (fresh, working) => `${fresh} nuevo(s) · ${working} en marcha`,
    markAllSeenLabel: 'Marcar todas las notificaciones como vistas',
    markAllSeen: (count) => `Marcar todo visto · ${count} notificación${count === 1 ? '' : 'es'}`,
    allClear: 'Todo al día',
    allClearBody: 'No hay pedidos esperando en el mostrador. Los nuevos aparecen aquí solos, sin recargar ni volver a entrar.',
    allClearHint: 'Los pedidos ya terminados están en Historial.',
    inProgress: 'En marcha',
    fresh: 'Nuevos',
  },
  en: {
    companyFallback: 'Your business',
    subtitle: (fresh, working) => `${fresh} new · ${working} in progress`,
    markAllSeenLabel: 'Mark all notifications as seen',
    markAllSeen: (count) => `Mark all seen · ${count} notification${count === 1 ? '' : 's'}`,
    allClear: 'All caught up',
    allClearBody: 'No orders are waiting at the counter. New ones show up here on their own, no reloading or signing back in.',
    allClearHint: 'Finished orders are in History.',
    inProgress: 'In progress',
    fresh: 'New',
  },
  fr: {
    companyFallback: 'Votre commerce',
    subtitle: (fresh, working) => `${fresh} nouvelle(s) · ${working} en cours`,
    markAllSeenLabel: 'Marquer toutes les notifications comme vues',
    markAllSeen: (count) => `Tout marquer comme vu · ${count} notification${count === 1 ? '' : 's'}`,
    allClear: 'Tout est à jour',
    allClearBody: 'Aucune commande n’attend au comptoir. Les nouvelles apparaissent ici toutes seules, sans recharger ni se reconnecter.',
    allClearHint: 'Les commandes terminées se trouvent dans l’Historique.',
    inProgress: 'En cours',
    fresh: 'Nouvelles',
  },
};

// The merchant's phone view: the counter's queue -- the orders still to be dealt with -- with the
// same accept/release/reject actions the web back office has, so a shopkeeper can run the counter
// from a phone. Finished orders are not here at all; they live on the Historial tab. All order
// reads and actions are scoped server-side by the token's company claim.

export function MerchantHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const tx = useStrings(S);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The order an action is running on, so only its buttons show a spinner.
  const [busyId, setBusyId] = useState<string | null>(null);
  // The order being accepted: confirming goes through the queue-time modal, which asks how long
  // it will wait before preparation starts, and only then calls the API.
  const [confirming, setConfirming] = useState<Order | null>(null);
  // Notifications sitting in the system tray, so "Marcar todo visto" only shows when there is
  // something to clear. Always 0 on web, which is what hides the button there.
  const [trayCount, setTrayCount] = useState(0);

  const refreshTray = useCallback(() => {
    void presentedNotificationCount().then(setTrayCount);
  }, []);

  const load = useCallback(async () => {
    const res = await api.merchantOrders(true);
    if (!res.success) { setError(res.message); return; }
    setError(null);
    setOrders(res.data ?? []);
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => alive && setLoading(false));
    refreshTray();
    // New orders arrive while the screen sits on the counter, so it polls itself.
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [load, refreshTray]));

  // The 15s poll above is the floor. A push telling the counter an order just landed is the
  // fastest signal there is, so reload the moment one arrives rather than waiting out the timer --
  // a shopkeeper watching the screen should see the order appear with the sound, not after it.
  //
  // 'order' is the merchant's own push type (see routeForNotification in pushNotifications.ts);
  // the driver's 'pool'/'assigned' pushes are not this screen's business. Verified against the
  // SDK 54 API: addNotificationReceivedListener returns an EventSubscription removed with
  // .remove(), and fires whenever a notification arrives while the app is running.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request?.content?.data as { type?: string } | undefined;
      if (data?.type === 'order') void load();
      // Whatever arrived is now in the tray; keep the "Marcar todo visto" counter honest.
      refreshTray();
    });
    return () => sub.remove();
  }, [load, refreshTray]);

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

  const companyName = profile?.merchantCompanyName ?? tx.companyFallback;

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
      {/* No subtitle with an empty counter: the "Todo al día" empty state below already says it,
          so the header saying it twice was just noise. */}
      <MerchantTopBar
        companyName={companyName}
        subtitle={orders.length > 0 ? tx.subtitle(fresh.length, working.length) : null}
      />

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
              {/* Tidies the tray without opening each notification: everything is dismissed and
                  the badge cleared. Only offered while something is actually sitting there. */}
              {trayCount > 0 ? (
                <Pressable
                  style={styles.clearBtn}
                  onPress={() => { void clearAllNotifications().then(refreshTray); }}
                  accessibilityRole="button"
                  accessibilityLabel={tx.markAllSeenLabel}
                >
                  <FontAwesome5 name="check-double" size={12} color={t.text} />
                  <Text style={styles.clearBtnText}>
                    {tx.markAllSeen(trayCount)}
                  </Text>
                </Pressable>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {orders.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyBadge}><Text style={styles.emptyEmoji}>🛎️</Text></View>
                  <Text style={styles.emptyTitle}>{tx.allClear}</Text>
                  <Text style={styles.emptySubtitle}>
                    {tx.allClearBody}
                  </Text>
                  <Text style={styles.emptyHint}>
                    {tx.allClearHint}
                  </Text>
                </View>
              ) : (
                <>
                  {working.length > 0 ? (
                    <>
                      <Text style={styles.sectionTitle}>{tx.inProgress}</Text>
                      {working.map((o) => <View key={o.id}>{renderCard(o)}</View>)}
                    </>
                  ) : null}
                  {/* The title only when something is under it: an empty "Nuevos" heading would
                      read as orders failing to load rather than none having arrived. */}
                  {fresh.length > 0 ? <Text style={styles.sectionTitle}>{tx.fresh}</Text> : null}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 86 },
  headerBlock: { gap: 12 },
  // A quiet pill, not a primary action: clearing the tray is housekeeping, and the accent stays
  // reserved for the order actions below it.
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
    paddingVertical: 9, paddingHorizontal: 14, alignSelf: 'flex-start',
  },
  clearBtnText: { color: t.text, fontSize: 13, fontWeight: '800' },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.textMuted, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 4 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },

  // An idle counter is the state this screen sits in most of the day, so it is worth more than one
  // muted sentence: the shop is told plainly that nothing is wrong and that it need not touch
  // anything to see the next order.
  emptyWrap: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 56 },
  emptyBadge: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: t.text, marginTop: 18 },
  emptySubtitle: {
    fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 20,
    marginTop: 6, maxWidth: 300,
  },
  emptyHint: {
    fontSize: 13, color: t.textFaint, textAlign: 'center', marginTop: 14,
  },
});
