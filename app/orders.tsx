import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Order } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

const money = (n: number) => `RD$${n.toFixed(2)}`;

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: '#d97706' },
  CONFIRMED: { label: 'Confirmado', color: '#2563eb' },
  PREPARING: { label: 'En preparación', color: '#7c3aed' },
  ON_THE_WAY: { label: 'En camino', color: '#0ea5e9' },
  DELIVERED: { label: 'Entregado', color: '#16a34a' },
  CANCELLED: { label: 'Cancelado', color: '#dc2626' },
};

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api.myOrders().then((res) => {
        if (active && res.success) setOrders(res.data ?? []);
      }).finally(() => active && setLoading(false));
      return () => { active = false; };
    }, []),
  );

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis pedidos</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Aún no tienes pedidos.</Text>}
          renderItem={({ item }) => {
            const s = STATUS[item.status] ?? { label: item.status, color: '#64748b' };
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/order/${item.id}`)}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                  <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
                </View>
                <Text style={styles.merchant}>{item.merchantName}</Text>
                <Text style={styles.items} numberOfLines={2}>
                  {item.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                </Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.total}>{money(item.total)}</Text>
                  <Text style={styles.track}>Seguir ›</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <BottomNav active="orders" />
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: t.text },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  merchant: { fontSize: 14, fontWeight: '700', color: t.text, marginTop: 8 },
  items: { fontSize: 13, color: t.textMuted, marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  total: { fontSize: 16, fontWeight: '800', color: t.text },
  track: { fontSize: 14, fontWeight: '800', color: t.text },
});
