import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Order } from '../src/api';

const RED = '#FA0050';
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
        <Text style={styles.title}>Mis pedidos</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  back: { color: RED, fontWeight: '700', fontSize: 16, width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#111827' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  empty: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: '#111827' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  merchant: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 8 },
  items: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  total: { fontSize: 16, fontWeight: '800', color: RED },
  track: { fontSize: 14, fontWeight: '800', color: RED },
});
