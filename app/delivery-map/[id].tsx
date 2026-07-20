import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import * as api from '../../src/api';
import type { Delivery } from '../../src/api';
import { RouteMap } from '../../src/RouteMap';
import { GradientBackground, t } from '../../src/theme';

// A map of one delivery's two stops: where to pick up (merchant) and where to deliver (client).
export default function DeliveryMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) return;
      const res = await api.myDeliveries();
      if (active && res.success) setDelivery((res.data ?? []).find((d) => d.id === id) ?? null);
    })().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, id]);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
        <Text style={styles.title}>{delivery?.deliveryNumber ?? 'Ruta'}</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : !delivery ? (
        <View style={styles.center}><Text style={styles.muted}>Entrega no encontrada.</Text></View>
      ) : (
        <>
          <RouteMap
            pickup={{ lat: null, lng: null, address: delivery.pickupAddress, label: '1', title: delivery.pickupName ?? 'Recoger', color: '#f59e0b' }}
            client={{ lat: delivery.latitude, lng: delivery.longitude, address: delivery.addressLine, label: '2', title: delivery.recipientName ?? 'Entregar', color: '#16a34a' }}
          />
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#f59e0b' }]}><Text style={styles.dotText}>1</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legendKind}>Recoger en</Text>
                <Text style={styles.legendName} numberOfLines={1}>{delivery.pickupName ?? '—'}</Text>
                {delivery.pickupAddress ? <Text style={styles.legendAddr} numberOfLines={1}>{delivery.pickupAddress}</Text> : null}
              </View>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#16a34a' }]}><Text style={styles.dotText}>2</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legendKind}>Entregar a</Text>
                <Text style={styles.legendName} numberOfLines={1}>{delivery.recipientName ?? '—'}</Text>
                {delivery.addressLine ? <Text style={styles.legendAddr} numberOfLines={1}>{delivery.addressLine}</Text> : null}
              </View>
            </View>
          </View>
        </>
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
  muted: { color: t.textMuted },
  legend: { padding: 14, gap: 12, borderTopWidth: 1, borderTopColor: t.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  legendKind: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  legendName: { fontSize: 15, fontWeight: '700', color: t.text },
  legendAddr: { fontSize: 13, color: t.textMuted },
});
