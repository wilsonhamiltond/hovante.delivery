import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Delivery } from '../src/api';
import { GradientBackground, t } from '../src/theme';

const STATUS: Record<string, { label: string; color: string }> = {
  DELIVERED: { label: 'Entregada', color: '#16a34a' },
  FAILED: { label: 'Fallida', color: '#dc2626' },
  RETURNED: { label: 'Devuelta', color: '#dc2626' },
  CANCELLED: { label: 'Cancelada', color: '#94a3b8' },
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
};

export default function HistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.deliveryHistory().then((res) => {
      if (active && res.success) setItems(res.data ?? []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
        <Text style={styles.title}>Historial de entregas</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Aún no tienes entregas finalizadas.</Text>}
          renderItem={({ item }) => {
            const s = STATUS[item.status] ?? { label: item.status, color: '#64748b' };
            const when = fmtDate(item.deliveredAt ?? item.failedAt ?? null);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/delivery/${item.id}`)}>
                <View style={styles.cardTop}>
                  <Text style={styles.number}>{item.deliveryNumber ?? 'Entrega'}</Text>
                  <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
                </View>
                <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? 'Destinatario'}</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {item.addressLine ?? 'Sin dirección'}{item.city ? `, ${item.city}` : ''}
                </Text>
                {item.status === 'DELIVERED' && item.receiverName ? (
                  <Text style={styles.meta}>Recibió: {item.receiverName}</Text>
                ) : null}
                {item.status === 'FAILED' && item.failureReason ? (
                  <Text style={styles.meta}>Motivo: {item.failureReason}</Text>
                ) : null}
                {when ? <Text style={styles.when}>{when}</Text> : null}
              </Pressable>
            );
          }}
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
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { fontSize: 15, fontWeight: '800', color: t.text },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  recipient: { fontSize: 15, fontWeight: '700', color: t.text, marginTop: 8 },
  address: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  meta: { fontSize: 13, color: t.textMuted, marginTop: 6 },
  when: { fontSize: 12, color: t.textFaint, marginTop: 6, fontWeight: '600' },
});
