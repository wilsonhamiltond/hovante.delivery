import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Delivery } from '../src/api';
import { GradientBackground, t } from '../src/theme';

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

  // Reached from the driver home normally, but also directly (e.g. after taking an order the pool is
  // popped off the stack). When there is nothing to go back to, land on the home instead of throwing
  // "GO_BACK was not handled".
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
        <Text style={styles.title}>Entregas disponibles</Text>
        <View style={{ width: 56 }} />
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
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  back: { color: t.text, fontWeight: '800', fontSize: 16, width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  recipient: { fontSize: 15, fontWeight: '700', color: t.text },
  address: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  num: { fontSize: 12, color: t.textFaint, marginTop: 4, fontWeight: '600' },
  takeBtn: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 74, alignItems: 'center' },
  takeText: { color: t.onAccent, fontWeight: '800', fontSize: 14 },
});
