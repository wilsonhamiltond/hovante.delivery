import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import * as outbox from './outbox';
import type { Delivery, Me } from './api';
import { GradientBackground, t } from './theme';

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

export function DriverHome({ profile, onSignOut }: { profile: Me | null; onSignOut: () => void }) {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const initial = (fullName || profile?.email || '?').charAt(0).toUpperCase();

  const soon = (label: string) => { setMenuOpen(false); Alert.alert(label, 'Disponible próximamente.'); };

  const stats = useMemo(() => {
    let pendientes = 0, enCamino = 0, entregadas = 0;
    for (const d of deliveries) {
      if (d.status === 'ASSIGNED' || d.status === 'PENDING') pendientes += 1;
      else if (d.status === 'IN_TRANSIT') enCamino += 1;
      else if (d.status === 'DELIVERED') entregadas += 1;
    }
    return { pendientes, enCamino, entregadas };
  }, [deliveries]);

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
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.menuBtn} accessibilityLabel="Abrir menú">
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>
          </View>
          <View style={styles.statsRow}>
            <StatTile label="Pendientes" value={stats.pendientes} />
            <StatTile label="En camino" value={stats.enCamino} />
            <StatTile label="Entregadas" value={stats.entregadas} />
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={deliveries}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListHeaderComponent={
          <View>
            <Pressable style={styles.pickupBtn} onPress={() => router.push('/pickup')}>
              <Text style={styles.pickupIcon}>🔍</Text>
              <Text style={styles.pickupText}>Entregas disponibles</Text>
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
        ListEmptyComponent={<Text style={styles.empty}>No tienes entregas asignadas para hoy.</Text>}
        renderItem={({ item }) => {
          const s = STATUS[item.status] ?? { label: item.status, color: '#64748b' };
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/delivery/${item.id}`)}>
              <View style={styles.seq}><Text style={styles.seqText}>{item.sequence}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? 'Destinatario'}</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {item.addressLine ?? 'Sin dirección'}{item.city ? `, ${item.city}` : ''}
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
            </Pressable>
          );
        }}
      />

      {/* Account menu: slides over from the right (like the client's) but with driver actions. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} accessibilityLabel="Cerrar menú" />
          <SafeAreaView edges={['top', 'bottom']} style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerName} numberOfLines={1}>{fullName || 'Repartidor'}</Text>
                {profile?.email ? <Text style={styles.drawerEmail} numberOfLines={1}>{profile.email}</Text> : null}
              </View>
            </View>

            <View style={styles.menuList}>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/pickup'); }}>
                <Text style={styles.menuItemIcon}>🔍</Text>
                <Text style={styles.menuItemText}>Entregas disponibles</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/history'); }}>
                <Text style={styles.menuItemIcon}>📋</Text>
                <Text style={styles.menuItemText}>Historial de entregas</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={() => soon('Mi vehículo')}>
                <Text style={styles.menuItemIcon}>🛵</Text>
                <Text style={styles.menuItemText}>Mi vehículo</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={() => soon('Ayuda')}>
                <Text style={styles.menuItemIcon}>❓</Text>
                <Text style={styles.menuItemText}>Ayuda</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }} />

            <Pressable style={styles.logout} onPress={() => { setMenuOpen(false); onSignOut(); }}>
              <Text style={styles.logoutIcon}>⎋</Text>
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
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
  menuBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  menuIcon: { color: t.text, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: t.text },
  statLabel: { fontSize: 12, color: t.textMuted, marginTop: 2, fontWeight: '600' },

  pickupBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.cardStrong, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginTop: 12, borderWidth: 1, borderColor: t.border },
  pickupIcon: { fontSize: 18 },
  pickupText: { flex: 1, fontSize: 15, fontWeight: '800', color: t.text },
  pickupChevron: { fontSize: 22, fontWeight: '800', color: t.text },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: t.text, marginTop: 8, marginBottom: 10 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  pendingBanner: { backgroundColor: 'rgba(251,191,36,0.2)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', borderRadius: 8, padding: 10, marginBottom: 8 },
  pendingText: { color: '#fde68a', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, gap: 12,
  },
  seq: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
  seqText: { color: t.text, fontWeight: '800', fontSize: 15 },
  recipient: { fontSize: 15, fontWeight: '700', color: t.text },
  address: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Account menu drawer -- solid deep blue for readable white text.
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { flex: 1 },
  drawer: { width: 300, maxWidth: '85%', backgroundColor: '#0b2a6b', paddingHorizontal: 20 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: t.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: t.text, fontSize: 20, fontWeight: '800' },
  drawerName: { fontSize: 16, fontWeight: '800', color: t.text },
  drawerEmail: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  menuList: { paddingTop: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  menuItemIcon: { fontSize: 18, width: 22, textAlign: 'center' },
  menuItemText: { fontSize: 16, color: t.text, fontWeight: '600' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, marginBottom: 8, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
  logoutIcon: { fontSize: 16, color: t.text },
  logoutText: { fontSize: 16, color: t.text, fontWeight: '800' },
});
