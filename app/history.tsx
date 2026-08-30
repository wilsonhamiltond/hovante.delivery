import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Delivery } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { NotificationsButton } from '../src/NotificationsButton';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';
import { useStrings, type Locale } from '../src/i18n';

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#16a34a',
  FAILED: '#dc2626',
  RETURNED: '#dc2626',
  CANCELLED: '#94a3b8',
};

const S: Record<
  Locale,
  {
    status: Record<string, string>;
    dateLocale: string;
    title: string;
    empty: string;
    delivery: string;
    recipient: string;
    noAddress: string;
    receivedByPrefix: string;
    reasonPrefix: string;
  }
> = {
  es: {
    status: {
      DELIVERED: 'Entregada',
      FAILED: 'Fallida',
      RETURNED: 'Devuelta',
      CANCELLED: 'Cancelada',
    },
    dateLocale: 'es-DO',
    title: 'Historial de entregas',
    empty: 'Aún no tienes entregas finalizadas.',
    delivery: 'Entrega',
    recipient: 'Destinatario',
    noAddress: 'Sin dirección',
    receivedByPrefix: 'Recibió: ',
    reasonPrefix: 'Motivo: ',
  },
  en: {
    status: {
      DELIVERED: 'Delivered',
      FAILED: 'Failed',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled',
    },
    dateLocale: 'en-US',
    title: 'Delivery history',
    empty: 'You have no finished deliveries yet.',
    delivery: 'Delivery',
    recipient: 'Recipient',
    noAddress: 'No address',
    receivedByPrefix: 'Received by: ',
    reasonPrefix: 'Reason: ',
  },
};

const fmtDate = (iso: string | null, locale: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

export default function HistoryScreen() {
  const router = useRouter();
  const tx = useStrings(S);
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
    <View style={styles.safe}>
      {/* The header carries the top inset itself, so the solid band reaches the screen edge. */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <Text style={styles.title}>{tx.title}</Text>
          <NotificationsButton audience="driver" />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{tx.empty}</Text>}
          renderItem={({ item }) => {
            const s = { label: tx.status[item.status] ?? item.status, color: STATUS_COLORS[item.status] ?? '#64748b' };
            const when = fmtDate(item.deliveredAt ?? item.failedAt ?? null, tx.dateLocale);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/delivery/${item.id}`)}>
                <View style={styles.cardTop}>
                  <Text style={styles.number}>{item.deliveryNumber ?? tx.delivery}</Text>
                  <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
                </View>
                <Text style={styles.recipient} numberOfLines={1}>{item.recipientName ?? tx.recipient}</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {item.addressLine ?? tx.noAddress}{item.city ? `, ${item.city}` : ''}
                </Text>
                {item.status === 'DELIVERED' && item.receiverName ? (
                  <Text style={styles.meta}>{tx.receivedByPrefix}{item.receiverName}</Text>
                ) : null}
                {item.status === 'FAILED' && item.failureReason ? (
                  <Text style={styles.meta}>{tx.reasonPrefix}{item.failureReason}</Text>
                ) : null}
                {when ? <Text style={styles.when}>{when}</Text> : null}
              </Pressable>
            );
          }}
        />
      )}
      <BottomNav active="history" variant="driver" />
    </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  // Solid, matching the bottom nav, so the header and the tab bar frame the screen as a pair;
  // the border mirrors the nav's top border.
  headerSafe: { backgroundColor: t.bar, borderBottomWidth: 1, borderBottomColor: t.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
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
