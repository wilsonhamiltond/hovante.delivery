import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { AddressHistory } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// The client's addresses: the saved ones first (the default one at the top, set from the sign-up
// location step), then any address seen only on past orders. Reachable from the account menu's
// "Direcciones".
export default function AddressesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AddressHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.myAddresses().then((res) => {
      if (active && res.success) setItems(res.data ?? []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Direcciones</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.address}
          contentContainerStyle={styles.list}
          ListHeaderComponent={items.length ? <Text style={styles.subtitle}>Tus direcciones guardadas y las que has usado para pedir</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>Aún no tienes direcciones. Las que uses para pedir aparecerán aquí.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.addressRow}>
                  <Text style={[styles.address, { flex: 1 }]}>{item.address}</Text>
                  {item.isDefault ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>Principal</Text></View>
                  ) : null}
                </View>
                {/* A saved address that has never been ordered to has no usage line to show. */}
                <Text style={styles.meta}>
                  {item.lastUsedAt
                    ? `${item.timesUsed === 1 ? 'Usada 1 vez' : `Usada ${item.timesUsed} veces`} · Último pedido ${fmtDate(item.lastUsedAt)}`
                    : item.label ?? 'Guardada'}
                </Text>
              </View>
            </View>
          )}
        />
      )}
      <BottomNav active="addresses" />
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
  subtitle: { fontSize: 13, color: t.textMuted, marginBottom: 4 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 18 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { fontSize: 15, fontWeight: '700', color: t.text },
  badge: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: t.onAccent, fontSize: 11, fontWeight: '800' },
  meta: { fontSize: 13, color: t.textMuted, marginTop: 4 },
});
