import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import type { MerchantOffice, Order } from '../../src/api';
import { PointsMap } from '../../src/PointsMap';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';

// The merchant watching their courier approach: the driver's last reported position and the
// street route from it to the branch the order is collected from. The driver's side of this
// (delivery-map) runs on the device's own GPS; here the position is the one the driver's app
// REPORTS upstream, so the screen polls the order for a fresh fix rather than asking the OS.

const fmtAgo = (iso?: string | null): string | null => {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  return `hace ${hours} h ${mins % 60} min`;
};

export default function MerchantDriverMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [offices, setOffices] = useState<MerchantOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.merchantOrders(true);
    if (!res.success) { setError(res.message); return; }
    setError(null);
    setOrder((res.data ?? []).find((o) => o.id === id) ?? null);
  }, [id]);

  // The driver's dot only moves when a fresh report arrives with the order, so the poll IS the
  // live tracking. Same cadence as the rest of the counter's screens.
  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => alive && setLoading(false));
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [load]));

  // The merchant's own branches, for the pin the route ends at. Fetched once per order.
  useEffect(() => {
    if (!order?.merchantCompanyId) return;
    let alive = true;
    api.merchantOffices(order.merchantCompanyId).then((res) => {
      if (alive && res.success) setOffices(res.data ?? []);
    });
    return () => { alive = false; };
  }, [order?.merchantCompanyId]);

  // The branch the courier is heading to: the order's own when it has one, else the first with a
  // pin -- the same fallback the server applies when it resolves a delivery's pickup.
  const geocoded = offices.filter((o) => o.latitude != null && o.longitude != null);
  const office = geocoded.find((o) => o.id === order?.officeId) ?? geocoded[0] ?? null;

  const driver = order?.driverLatitude != null && order?.driverLongitude != null
    ? { lat: order.driverLatitude, lng: order.driverLongitude }
    : null;
  const reportedAgo = fmtAgo(order?.driverPositionAt);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <Text style={styles.title}>{order?.orderNumber ?? 'Repartidor'}</Text>
        <View style={{ width: BACK_BUTTON_WIDTH }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : !order ? (
        <View style={styles.center}><Text style={styles.muted}>{error ?? 'Pedido no encontrado.'}</Text></View>
      ) : !office ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Tu comercio no tiene una sucursal con ubicación en el mapa.</Text>
        </View>
      ) : (
        <>
          {/* Keyed by what the map was built with: it renders its HTML once on mount, so a driver
              dot that appears AFTER (the first report landing mid-view) needs a rebuild. Later
              movement rides in over the live channel without one. */}
          <PointsMap
            key={`${office.id}:${driver == null ? 'sin' : 'con'}`}
            points={[{
              lat: office.latitude, lng: office.longitude, address: office.address,
              // The branch wears the company's own logo; the shop emoji is what stands there
              // until a merchant uploads one.
              label: '🏪', title: office.name, color: '#0b2a6b', imageUrl: order.merchantImageUrl,
            }]}
            driver={driver}
            routeFromDriver
          />
          <View style={styles.footer}>
            {driver ? (
              <Text style={styles.footerText}>
                🛵 {order.driverName ?? 'Repartidor'} en camino a {office.name}
                {reportedAgo ? ` · reportado ${reportedAgo}` : ''}
              </Text>
            ) : (
              <Text style={styles.footerText}>
                El repartidor aún no reporta su ubicación. El mapa se actualizará solo.
              </Text>
            )}
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
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: t.textMuted, textAlign: 'center' },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: t.border },
  footerText: { fontSize: 14, fontWeight: '700', color: t.text, textAlign: 'center' },
});
