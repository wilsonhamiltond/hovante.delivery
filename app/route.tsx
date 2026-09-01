import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import * as outbox from '../src/outbox';
import type { Delivery } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { NotificationsButton } from '../src/NotificationsButton';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';
import { useStrings, type Locale } from '../src/i18n';

// "Mi ruta": every delivery the driver is carrying right now -- claimed, about to start, or on the
// road -- in route order, each opening its detail. Finished ones live in Historial; finding NEW
// work lives on the home map. This page is only the work in hand.

// The two legs of a delivery, named. "Asignada" and "En camino" both said something true and
// neither said where the driver is headed -- which is the only thing these two states differ by.
const STATUS_COLORS: Record<string, string> = {
  PENDING: '#64748b',
  ASSIGNED: '#2563eb',
  IN_TRANSIT: '#d97706',
};

const S: Record<
  Locale,
  {
    status: Record<string, string>;
    title: string;
    inProgress: (n: number) => string;
    pendingSync: (n: number) => string;
    emptyTitle: string;
    emptySubtitle: string;
    delivery: string;
    pickupPrefix: string;
    recipient: string;
    noAddress: string;
    toCollect: string;
    call: string;
  }
> = {
  es: {
    status: {
      PENDING: 'Pendiente',
      ASSIGNED: 'Recoger en oficina',
      IN_TRANSIT: 'En camino al cliente',
    },
    title: 'Mi ruta',
    inProgress: (n) => `${n} entrega(s) en curso`,
    pendingSync: (n) => `${n} acción(es) pendiente(s) de sincronizar. Desliza para reintentar.`,
    emptyTitle: 'Sin entregas en curso',
    emptySubtitle: 'Toma un pedido desde el mapa de inicio y aparecerá aquí como tu ruta.',
    delivery: 'Entrega',
    pickupPrefix: '🏪 Recoger: ',
    recipient: 'Destinatario',
    noAddress: 'Sin dirección',
    toCollect: 'a cobrar',
    call: '📞 Llamar',
  },
  en: {
    status: {
      PENDING: 'Pending',
      ASSIGNED: 'Pick up at the office',
      IN_TRANSIT: 'On the way to the customer',
    },
    title: 'My route',
    inProgress: (n) => `${n} delivery(ies) in progress`,
    pendingSync: (n) => `${n} action(s) waiting to sync. Pull to retry.`,
    emptyTitle: 'No deliveries in progress',
    emptySubtitle: 'Take an order from the home map and it will show up here as your route.',
    delivery: 'Delivery',
    pickupPrefix: '🏪 Pick up: ',
    recipient: 'Recipient',
    noAddress: 'No address',
    toCollect: 'to collect',
    call: '📞 Call',
  },
  fr: {
    status: {
      PENDING: 'En attente',
      ASSIGNED: 'À récupérer au commerce',
      IN_TRANSIT: 'En route vers le client',
    },
    title: 'Ma tournée',
    inProgress: (n) => `${n} livraison(s) en cours`,
    pendingSync: (n) => `${n} action(s) en attente de synchronisation. Faites glisser pour réessayer.`,
    emptyTitle: 'Aucune livraison en cours',
    emptySubtitle: "Prenez une commande depuis la carte d'accueil et elle apparaîtra ici comme votre tournée.",
    delivery: 'Livraison',
    pickupPrefix: '🏪 Récupérer : ',
    recipient: 'Destinataire',
    noAddress: 'Sans adresse',
    toCollect: 'à encaisser',
    call: '📞 Appeler',
  },
};

const money = (n: number) => `RD$${n.toFixed(2)}`;

export default function RouteScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await api.myDeliveries();
    if (!res.success) { setError(res.message); return; }
    setDeliveries(res.data ?? []);
  }, []);

  // On focus: flush any queued offline actions, reload the route, then show what's still pending.
  useFocusEffect(useCallback(() => {
    (async () => { await outbox.flush(); await load(); setPending(await outbox.pendingCount()); })();
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await outbox.flush();
    await load();
    setPending(await outbox.pendingCount());
    setRefreshing(false);
  };

  // The work in hand: assigned, pending or already riding. Everything finished has its own tab.
  const route = useMemo(
    () => deliveries.filter((d) => d.status === 'ASSIGNED' || d.status === 'PENDING' || d.status === 'IN_TRANSIT'),
    [deliveries],
  );

  return (
    <GradientBackground>
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>{tx.title}</Text>
            <NotificationsButton audience="driver" />
          </View>
          {/* With nothing in hand there is no line at all: the empty state below already says it. */}
          {route.length > 0 ? (
            <Text style={styles.subtitle}>{tx.inProgress(route.length)}</Text>
          ) : null}
        </View>
      </SafeAreaView>

      <FlatList
        data={route}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListHeaderComponent={
          <View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {pending > 0 ? (
              <View style={styles.pendingBanner}>
                <Text style={styles.pendingText}>{tx.pendingSync(pending)}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyBadge}><Text style={styles.emptyEmoji}>🚚</Text></View>
            <Text style={styles.emptyTitle}>{tx.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>
              {tx.emptySubtitle}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const s = { label: tx.status[item.status] ?? item.status, color: STATUS_COLORS[item.status] ?? '#64748b' };
          // The whole stop at a glance, so the driver decides without opening it: where to pick up,
          // where to drop off, what to collect, and who to call. Every line hides when its data is
          // missing -- a delivery with no order behind it just shows fewer rows.
          const collect = item.orderTotal != null ? item.orderTotal + (item.orderDeliveryFee ?? 0) : null;
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/delivery/${item.id}`)}>
              <View style={styles.cardTop}>
                <View style={styles.seq}><Text style={styles.seqText}>{item.sequence}</Text></View>
                <Text style={styles.number} numberOfLines={1}>{item.deliveryNumber ?? tx.delivery}</Text>
                <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
              </View>

              {item.pickupName || item.pickupAddress ? (
                <Text style={styles.line} numberOfLines={1}>
                  <Text style={styles.lineKind}>{tx.pickupPrefix}</Text>{item.pickupName ?? item.pickupAddress}
                </Text>
              ) : null}

              <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? tx.recipient}</Text>
              <Text style={styles.address} numberOfLines={2}>
                📍 {item.addressLine ?? tx.noAddress}{item.city ? `, ${item.city}` : ''}
              </Text>

              {item.notes ? <Text style={styles.notes} numberOfLines={2}>📝 {item.notes}</Text> : null}

              {collect != null || item.clientPhone ? (
                <View style={styles.cardFoot}>
                  {collect != null ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.collect}>{money(collect)}</Text>
                      <Text style={styles.collectLabel}>{tx.toCollect}</Text>
                    </View>
                  ) : <View style={{ flex: 1 }} />}
                  {item.clientPhone ? (
                    <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${item.clientPhone}`)}>
                      <Text style={styles.callBtnText}>{tx.call}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      <BottomNav active="route" variant="driver" />
    </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  // Solid, matching the bottom nav, so the header and the tab bar frame the screen as a pair;
  // the border mirrors the nav's top border.
  headerSafe: { backgroundColor: t.bar, borderBottomWidth: 1, borderBottomColor: t.border },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '900', color: t.text },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 2, fontWeight: '600' },
  list: { padding: 16, gap: 10, paddingBottom: BOTTOM_NAV_HEIGHT + 24, flexGrow: 1 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  pendingBanner: { backgroundColor: 'rgba(251,191,36,0.2)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', borderRadius: 8, padding: 10, marginBottom: 8 },
  pendingText: { color: '#fde68a', fontSize: 13, fontWeight: '600' },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyBadge: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: t.text, marginTop: 18 },
  emptySubtitle: {
    fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 20,
    marginTop: 6, maxWidth: 280,
  },

  card: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  number: { flex: 1, fontSize: 13, fontWeight: '800', color: t.textMuted, letterSpacing: 0.3 },
  seq: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
  seqText: { color: t.text, fontWeight: '800', fontSize: 15 },
  line: { fontSize: 13, color: t.text, fontWeight: '600' },
  lineKind: { color: t.textMuted, fontWeight: '700' },
  recipient: { fontSize: 15, fontWeight: '700', color: t.text },
  address: { fontSize: 13, color: t.textMuted },
  notes: { fontSize: 13, color: t.textMuted, fontStyle: 'italic' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 },
  collect: { fontSize: 17, fontWeight: '900', color: t.text },
  collectLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.4 },
  callBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  callBtnText: { color: t.text, fontWeight: '700', fontSize: 13 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
