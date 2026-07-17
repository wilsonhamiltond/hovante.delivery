import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import * as outbox from '../src/outbox';
import type { Delivery, Me } from '../src/api';

// Friendly status labels + a colour, keyed by DeliveryStatus from the API.
const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: '#64748b' },
  ASSIGNED: { label: 'Asignada', color: '#2563eb' },
  IN_TRANSIT: { label: 'En camino', color: '#d97706' },
  DELIVERED: { label: 'Entregada', color: '#16a34a' },
  FAILED: { label: 'Fallida', color: '#dc2626' },
  RETURNED: { label: 'Devuelta', color: '#dc2626' },
  CANCELLED: { label: 'Cancelada', color: '#94a3b8' },
};

export default function HomeScreen() {
  const { token, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Me | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    const meRes = await api.me();
    if (!meRes.success) { setError(meRes.message); return; }
    setProfile(meRes.data);
    // Only a driver has a route; a customer sees the welcome fallback.
    if (meRes.data.isDriver) {
      const dRes = await api.myDeliveries();
      if (!dRes.success) { setError(dRes.message); return; }
      setDeliveries(dRes.data ?? []);
    }
  }, [token]);

  // On every focus: flush any queued offline actions first (8.5.8), then load fresh data, then show
  // how many are still pending. Returning from a stop's actions therefore both syncs and refreshes.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (token) await outbox.flush();
        await load();
        setPending(await outbox.pendingCount());
      })().finally(() => setLoading(false));
    }, [token, load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (token) await outbox.flush();
    await load();
    setPending(await outbox.pendingCount());
    setRefreshing(false);
  };

  const greeting = profile?.name?.trim() || profile?.email || '';

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Hola, {greeting}</Text>
          <Text style={styles.role}>{profile?.isDriver ? 'Repartidor' : 'Cliente'}</Text>
        </View>
        <Pressable onPress={signOut} hitSlop={8}><Text style={styles.signOut}>Salir</Text></Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {pending > 0 ? (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>{pending} acción(es) pendiente(s) de sincronizar. Desliza para reintentar.</Text>
        </View>
      ) : null}

      {profile?.isDriver ? (
        <>
          <Text style={styles.title}>Mi ruta de hoy</Text>
          <FlatList
            data={deliveries}
            keyExtractor={(d) => d.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={<Text style={styles.empty}>No tiene entregas asignadas para hoy.</Text>}
            renderItem={({ item }) => {
              const s = STATUS[item.status] ?? { label: item.status, color: '#64748b' };
              return (
                <Pressable style={styles.card} onPress={() => router.push(`/delivery/${item.id}`)}>
                  <View style={styles.seq}><Text style={styles.seqText}>{item.sequence}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recipient}>{item.recipientName ?? 'Destinatario'}</Text>
                    <Text style={styles.address}>{item.addressLine ?? 'Sin dirección'}{item.city ? `, ${item.city}` : ''}</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
                </Pressable>
              );
            }}
          />
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.title}>Bienvenido</Text>
          <Text style={styles.empty}>La experiencia de cliente (pedidos y seguimiento) se construye a continuación.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  hello: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  role: { fontSize: 13, color: '#64748b', marginTop: 2 },
  signOut: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a', paddingHorizontal: 20, marginTop: 8, marginBottom: 4 },
  error: { color: '#dc2626', fontSize: 14, paddingHorizontal: 20, paddingVertical: 6 },
  pendingBanner: { backgroundColor: '#fef3c7', marginHorizontal: 16, borderRadius: 8, padding: 10 },
  pendingText: { color: '#92400e', fontSize: 13 },
  list: { padding: 16, gap: 10 },
  empty: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  seq: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  seqText: { color: '#2563eb', fontWeight: '700' },
  recipient: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  address: { fontSize: 13, color: '#64748b', marginTop: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
