import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import * as outbox from './outbox';
import type { Delivery, Me } from './api';
import { GradientBackground, t } from './theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from './BottomNav';
import { NEARBY_RADIUS_KM, useNearbyAvailable } from './nearby';

// The driver's home: the day's counters over the blue gradient, then "Mi ruta de hoy" -- the assigned
// stops in order, each opening its detail.

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: '#64748b' },
  ASSIGNED: { label: 'Asignada', color: '#2563eb' },
  IN_TRANSIT: { label: 'En camino', color: '#d97706' },
  DELIVERED: { label: 'Entregada', color: '#16a34a' },
  FAILED: { label: 'Fallida', color: '#dc2626' },
  RETURNED: { label: 'Devuelta', color: '#dc2626' },
  CANCELLED: { label: 'Cancelada', color: '#94a3b8' },
};

const money = (n: number) => `RD$${n.toFixed(2)}`;

export function DriverHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const nearby = useNearbyAvailable();

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

  const fullName = profile?.name?.trim() || '';
  const greeting = fullName.split(' ')[0] || profile?.email || '';

  const stats = useMemo(() => {
    let pendientes = 0, enCamino = 0, entregadas = 0;
    for (const d of deliveries) {
      if (d.status === 'ASSIGNED' || d.status === 'PENDING') pendientes += 1;
      else if (d.status === 'IN_TRANSIT') enCamino += 1;
      else if (d.status === 'DELIVERED') entregadas += 1;
    }
    return { pendientes, enCamino, entregadas };
  }, [deliveries]);

  // "Mi ruta de hoy" is the work that is left, so a delivered stop drops off it: there is no action
  // left on it and it already lives in the history tab. The counters above still read the full list,
  // since they summarise the day rather than the remaining route.
  const route = useMemo(() => deliveries.filter((d) => d.status !== 'DELIVERED'), [deliveries]);

  return (
    <GradientBackground>
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.headerBand}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello} numberOfLines={1}>¡Hola, {greeting}! 🛵</Text>
              <Text style={styles.role}>Repartidor</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <StatTile label="Pendientes" value={stats.pendientes} />
            <StatTile label="En camino" value={stats.enCamino} />
            <StatTile label="Entregadas" value={stats.entregadas} />
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={route}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListHeaderComponent={
          <View>
            {/* The pool, carried onto the home as a count: the driver sees there is work to claim
                without opening the screen to find out. Silent when there is nothing -- a "0" badge
                is noise, and the button still works as a way in. */}
            <Pressable style={styles.pickupBtn} onPress={() => router.push('/pickup')}>
              <Text style={styles.pickupIcon}>🔍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickupText}>Entregas disponibles</Text>
                {nearby.count > 0 ? (
                  <Text style={styles.pickupSub}>
                    {nearby.filtered ? `Listas para tomar a menos de ${NEARBY_RADIUS_KM} km` : 'Listas para tomar'}
                  </Text>
                ) : null}
              </View>
              {nearby.count > 0 ? (
                <View style={styles.pickupBadge}>
                  <Text style={styles.pickupBadgeText}>{nearby.count > 99 ? '99+' : nearby.count}</Text>
                </View>
              ) : null}
              <Text style={styles.pickupChevron}>›</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>Mi ruta de hoy</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {pending > 0 ? (
              <View style={styles.pendingBanner}>
                <Text style={styles.pendingText}>{pending} acción(es) pendiente(s) de sincronizar. Desliza para reintentar.</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          // An emptied route reads differently from one that was never filled: the driver who just
          // closed their last stop should be told they finished, not that they were assigned nothing.
          <Text style={styles.empty}>
            {deliveries.length > 0
              ? '¡Listo! Completaste todas tus entregas. 🎉'
              : 'No tienes entregas asignadas para hoy.'}
          </Text>
        }
        renderItem={({ item }) => {
          const s = STATUS[item.status] ?? { label: item.status, color: '#64748b' };
          // The whole stop at a glance, so the driver decides without opening it: where to pick up,
          // where to drop off, what to collect, and who to call. Every line hides when its data is
          // missing -- a delivery with no order behind it just shows fewer rows.
          const collect = item.orderTotal != null ? item.orderTotal + (item.orderDeliveryFee ?? 0) : null;
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/delivery/${item.id}`)}>
              <View style={styles.cardTop}>
                <View style={styles.seq}><Text style={styles.seqText}>{item.sequence}</Text></View>
                <Text style={styles.number} numberOfLines={1}>{item.deliveryNumber ?? 'Entrega'}</Text>
                <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
              </View>

              {item.pickupName || item.pickupAddress ? (
                <Text style={styles.line} numberOfLines={1}>
                  <Text style={styles.lineKind}>🏪 Recoger: </Text>{item.pickupName ?? item.pickupAddress}
                </Text>
              ) : null}

              <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? 'Destinatario'}</Text>
              <Text style={styles.address} numberOfLines={2}>
                📍 {item.addressLine ?? 'Sin dirección'}{item.city ? `, ${item.city}` : ''}
              </Text>

              {item.notes ? <Text style={styles.notes} numberOfLines={2}>📝 {item.notes}</Text> : null}

              {collect != null || item.clientPhone ? (
                <View style={styles.cardFoot}>
                  {collect != null ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.collect}>{money(collect)}</Text>
                      <Text style={styles.collectLabel}>a cobrar</Text>
                    </View>
                  ) : <View style={{ flex: 1 }} />}
                  {item.clientPhone ? (
                    <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${item.clientPhone}`)}>
                      <Text style={styles.callBtnText}>📞 Llamar</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      <BottomNav active="home" variant="driver" />
    </View>
    </GradientBackground>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  headerSafe: { backgroundColor: 'transparent' },
  headerBand: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hello: { fontSize: 22, fontWeight: '800', color: t.text },
  role: { fontSize: 13, color: t.textMuted, marginTop: 2, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: t.text },
  statLabel: { fontSize: 12, color: t.textMuted, marginTop: 2, fontWeight: '600' },

  pickupBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.cardStrong, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginTop: 12, borderWidth: 1, borderColor: t.border },
  pickupIcon: { fontSize: 18 },
  pickupText: { fontSize: 15, fontWeight: '800', color: t.text },
  pickupSub: { fontSize: 12, fontWeight: '600', color: t.textMuted, marginTop: 2 },
  pickupBadge: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' },
  pickupBadgeText: { color: t.onAccent, fontSize: 13, fontWeight: '900' },
  pickupChevron: { fontSize: 22, fontWeight: '800', color: t.text },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: t.text, marginTop: 8, marginBottom: 10 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  pendingBanner: { backgroundColor: 'rgba(251,191,36,0.2)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', borderRadius: 8, padding: 10, marginBottom: 8 },
  pendingText: { color: '#fde68a', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 10, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 20 },
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
