import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { AddressHistory } from '../src/api';
import { GradientBackground, t } from '../src/theme';

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// The client's address history: the addresses they've ordered to, most recent first. Reachable from
// the account menu's "Direcciones".
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
        <Text style={styles.title}>Direcciones</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.address}
          contentContainerStyle={styles.list}
          ListHeaderComponent={items.length ? <Text style={styles.subtitle}>Direcciones que has usado para pedir</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>Aún no has hecho pedidos. Tus direcciones aparecerán aquí.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.address}>{item.address}</Text>
                <Text style={styles.meta}>
                  {item.timesUsed === 1 ? 'Usada 1 vez' : `Usada ${item.timesUsed} veces`} · Último pedido {fmtDate(item.lastUsedAt)}
                </Text>
              </View>
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
  subtitle: { fontSize: 13, color: t.textMuted, marginBottom: 4 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 18 },
  address: { fontSize: 15, fontWeight: '700', color: t.text },
  meta: { fontSize: 13, color: t.textMuted, marginTop: 4 },
});
