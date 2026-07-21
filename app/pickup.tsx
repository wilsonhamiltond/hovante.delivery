import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Delivery } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

// The pickup pool: unassigned deliveries a driver can claim. Taking one assigns it to the driver
// (server-side, atomic) and it disappears from the pool.
export default function PickupScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.availableDeliveries();
    if (res.success) setItems(res.data ?? []);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    load().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };


  const pickup = async (d: Delivery) => {
    setClaimingId(d.id);
    const res = await api.pickupDelivery(d.id);
    setClaimingId(null);
    if (!res.success) {
      // Someone else likely took it -- refresh the pool so it reflects reality.
      Alert.alert('No disponible', res.message);
      await load();
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    // The order is now on the driver's route -- take them straight to its delivery detail.
    router.push(`/delivery/${d.id}`);
  };

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Entregas disponibles</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          ListEmptyComponent={<Text style={styles.empty}>No hay entregas disponibles por ahora.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? 'Destinatario'}</Text>
                <Text style={styles.address} numberOfLines={2}>
                  {item.addressLine ?? 'Sin dirección'}{item.city ? `, ${item.city}` : ''}
                </Text>
                {item.deliveryNumber ? <Text style={styles.num}>{item.deliveryNumber}</Text> : null}
              </View>
              <Pressable
                style={[styles.takeBtn, claimingId === item.id && { opacity: 0.6 }]}
                onPress={() => pickup(item)}
                disabled={claimingId === item.id}
              >
                {claimingId === item.id ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.takeText}>Tomar</Text>}
              </Pressable>
            </View>
          )}
        />
      )}
      <BottomNav active="pickup" variant="driver" />
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  recipient: { fontSize: 15, fontWeight: '700', color: t.text },
  address: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  num: { fontSize: 12, color: t.textFaint, marginTop: 4, fontWeight: '600' },
  takeBtn: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 74, alignItems: 'center' },
  takeText: { color: t.onAccent, fontWeight: '800', fontSize: 14 },
});
