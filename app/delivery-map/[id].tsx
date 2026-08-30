import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import * as api from '../../src/api';
import type { Delivery } from '../../src/api';
import { RouteMap } from '../../src/RouteMap';
import { formatEta, useRouteEta, type RouteEstimate } from '../../src/eta';
import { useCoarsePosition, useDriverPosition } from '../../src/position';
import { useDriverPositionReporter } from '../../src/positionReport';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { useStrings, type Locale } from '../../src/i18n';

const S: Record<
  Locale,
  {
    routeTitle: string;
    notFound: string;
    pickupTitle: string;
    deliverTitle: string;
    totalEta: (eta: string) => string;
    yourLocation: string;
    liveAccuracy: (m: number) => string;
    live: string;
    pickupAt: string;
    deliverTo: string;
  }
> = {
  es: {
    routeTitle: 'Ruta',
    notFound: 'Entrega no encontrada.',
    pickupTitle: 'Recoger',
    deliverTitle: 'Entregar',
    totalEta: (eta) => `⏱️ Total ${eta}`,
    yourLocation: 'Tu ubicación',
    liveAccuracy: (m) => `En vivo · ±${m} m`,
    live: 'En vivo',
    pickupAt: 'Recoger en',
    deliverTo: 'Entregar a',
  },
  en: {
    routeTitle: 'Route',
    notFound: 'Delivery not found.',
    pickupTitle: 'Pick up',
    deliverTitle: 'Deliver',
    totalEta: (eta) => `⏱️ Total ${eta}`,
    yourLocation: 'Your location',
    liveAccuracy: (m) => `Live · ±${m} m`,
    live: 'Live',
    pickupAt: 'Pick up at',
    deliverTo: 'Deliver to',
  },
};

// A map of one delivery's two stops -- where to pick up (merchant) and where to deliver (client) --
// plus the driver themselves, tracked live while the screen is open.
export default function DeliveryMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const tx = useStrings(S);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  // The driver's own dot, refreshed as they ride. Null until the first fix, and for good if the
  // location permission is refused -- the map is still worth showing with only its two stops.
  const driver = useDriverPosition();
  // And reported upstream (throttled) so the merchant sees where their order is while this map --
  // the screen a riding driver actually keeps open -- stays up.
  useDriverPositionReporter(driver);
  // The estimate re-requests whenever its origin changes, so it runs off a position that only moves
  // in hundred-metre steps rather than off every GPS tick.
  const routeOrigin = useCoarsePosition(driver, 100);

  // The ride as the driver actually rides it: to the office first, then on to the client. The two
  // legs are estimated separately -- the first is the part they can still shorten by leaving now,
  // and lumping both into one number hides it.
  const toPickup = useRouteEta(
    routeOrigin?.lat, routeOrigin?.lng,
    delivery?.pickupLatitude, delivery?.pickupLongitude,
  );
  const toClient = useRouteEta(
    delivery?.pickupLatitude, delivery?.pickupLongitude,
    delivery?.latitude, delivery?.longitude,
  );
  const total: RouteEstimate | null = toPickup && toClient
    ? { durationSec: toPickup.durationSec + toClient.durationSec, distanceM: toPickup.distanceM + toClient.distanceM }
    : null;

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
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <Text style={styles.title}>{delivery?.deliveryNumber ?? tx.routeTitle}</Text>
        <View style={{ width: BACK_BUTTON_WIDTH }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : !delivery ? (
        <View style={styles.center}><Text style={styles.muted}>{tx.notFound}</Text></View>
      ) : (
        <>
          <RouteMap
            // The route's origin is the company office itself (its stored coordinates); the
            // address is only the geocoding fallback for offices that predate coordinates.
            // Each stop wears its own face where there is one -- the shop's logo on the office,
            // the customer's photo on the door -- and falls back to the numbered teardrop.
            pickup={{ lat: delivery.pickupLatitude, lng: delivery.pickupLongitude, address: delivery.pickupAddress, label: '1', title: delivery.pickupName ?? tx.pickupTitle, color: '#f59e0b', imageUrl: delivery.pickupImageUrl }}
            client={{ lat: delivery.latitude, lng: delivery.longitude, address: delivery.addressLine, label: '2', title: delivery.recipientName ?? tx.deliverTitle, color: '#16a34a', imageUrl: delivery.customerImageUrl }}
            driver={driver}
          />
          {/* The legend reads in ride order -- you, then the office, then the client -- with each
              leg's estimate on the line between the two stops it joins. */}
          <View style={styles.legend}>
            {total ? <Text style={styles.eta}>{tx.totalEta(formatEta(total))}</Text> : null}

            {/* Only once there is a fix: a legend entry for a dot that is not on the map would have
                the driver looking for something that is not there. */}
            {driver ? (
              <>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: '#2563eb' }]}><Text style={styles.dotEmoji}>🛵</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendKind}>{tx.yourLocation}</Text>
                    {/* The precision is named rather than implied. A fix good to 800 m drawn as a
                        confident dot is worse than no dot -- the driver would trust it. */}
                    <Text style={styles.legendName}>
                      {driver.accuracyM != null ? tx.liveAccuracy(Math.round(driver.accuracyM)) : tx.live}
                    </Text>
                  </View>
                </View>
                <Leg color="#f59e0b" estimate={toPickup} />
              </>
            ) : null}

            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#f59e0b' }]}><Text style={styles.dotText}>1</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legendKind}>{tx.pickupAt}</Text>
                <Text style={styles.legendName} numberOfLines={1}>{delivery.pickupName ?? '—'}</Text>
                {delivery.pickupAddress ? <Text style={styles.legendAddr} numberOfLines={1}>{delivery.pickupAddress}</Text> : null}
              </View>
            </View>

            <Leg color="#2563eb" estimate={toClient} />

            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#16a34a' }]}><Text style={styles.dotText}>2</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legendKind}>{tx.deliverTo}</Text>
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

// The connector between two legend stops, carrying that leg's estimate. The rule is drawn in the
// leg's own colour so the line here and the line on the map are recognisably the same one. Rendered
// even while the estimate is missing: the stops are still joined, we just cannot say how long yet.
function Leg({ color, estimate }: { color: string; estimate: RouteEstimate | null }) {
  return (
    <View style={styles.leg}>
      <View style={styles.legRailCell}><View style={[styles.legRail, { backgroundColor: color }]} /></View>
      <Text style={styles.legText}>{estimate ? formatEta(estimate) : '···'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: t.textMuted },
  legend: { padding: 14, gap: 8, borderTopWidth: 1, borderTopColor: t.border },
  // The rail sits in a cell the width of a legend dot, so it lines up under the dots above it.
  leg: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legRailCell: { width: 26, alignItems: 'center' },
  legRail: { width: 3, height: 18, borderRadius: 2, opacity: 0.8 },
  legText: { flex: 1, fontSize: 13, fontWeight: '700', color: t.textMuted },
  eta: { color: t.text, fontWeight: '800', fontSize: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dotEmoji: { fontSize: 13 },
  legendKind: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  legendName: { fontSize: 15, fontWeight: '700', color: t.text },
  legendAddr: { fontSize: 13, color: t.textMuted },
});
