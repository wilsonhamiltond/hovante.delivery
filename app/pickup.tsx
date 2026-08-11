import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Delivery } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

// The pickup pool: unassigned deliveries a driver can claim. This screen only lists them -- opening
// one shows what it pays and where it goes, and taking it happens there, so a mis-tap in a list can
// no longer commit a driver to a job they have not read.
export default function PickupScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
            // The whole row opens it, not just the button -- the button is there to name what the
            // tap does, and a driver reaching for a card should not have to find the small target.
            <Pressable style={styles.card} onPress={() => router.push(`/available/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? 'Destinatario'}</Text>
                <Text style={styles.address} numberOfLines={2}>
                  {item.addressLine ?? 'Sin dirección'}{item.city ? `, ${item.city}` : ''}
                </Text>
                {item.deliveryNumber ? <Text style={styles.num}>{item.deliveryNumber}</Text> : null}
              </View>
              <View style={styles.viewBtn}><Text style={styles.viewText}>Ver orden</Text></View>
            </Pressable>
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
  viewBtn: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  viewText: { color: t.onAccent, fontWeight: '800', fontSize: 14 },
});
