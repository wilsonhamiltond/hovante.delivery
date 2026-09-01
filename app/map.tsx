import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RouteMap } from '../src/RouteMap';
import { formatEta, useRouteEta } from '../src/eta';
import { useCoarsePosition, useDriverPosition } from '../src/position';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    locationTitle: string;
    noLocation: string;
    merchant: string;
    deliverAt: string;
    addressLabel: string;
  }
> = {
  es: {
    locationTitle: 'Ubicación',
    noLocation: 'Esta dirección no tiene ubicación.',
    merchant: 'Comercio',
    deliverAt: 'Entregar en',
    addressLabel: 'Dirección',
  },
  en: {
    locationTitle: 'Location',
    noLocation: 'This address has no location.',
    merchant: 'Merchant',
    deliverAt: 'Deliver to',
    addressLabel: 'Address',
  },
  fr: {
    locationTitle: 'Emplacement',
    noLocation: 'Cette adresse n’a pas d’emplacement.',
    merchant: 'Commerce',
    deliverAt: 'Livrer à',
    addressLabel: 'Adresse',
  },
};

// One point on a map, in the app rather than handing off to Google Maps. Used by both order-detail
// screens: the driver's pickup/dropoff buttons and the client's delivery address.
//
// RouteMap takes two points; the empty one resolves to nothing, so it draws a single marker and
// zooms to it. A point with no coordinates is forward-geocoded from its address by the map itself.
export default function MapScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const { lat, lng, address, title, img, me, olat, olng, oaddress, otitle, oimg } = useLocalSearchParams<{
    lat?: string; lng?: string; address?: string; title?: string;
    /** The face for the destination pin (the customer's photo). Optional; a pin without one keeps
     *  its numbered teardrop. */
    img?: string;
    /** '1' routes from the device itself: the driver's live dot plus the street route from it to
     *  the pin, redrawn as they ride. The driver screens send it; client/merchant openings do not,
     *  so those never prompt for a location permission. */
    me?: string;
    // The other end of the route, when there is one: the merchant's branch. Optional -- without it
    // this stays the single-pin map it has always been.
    olat?: string; olng?: string; oaddress?: string; otitle?: string; oimg?: string;
  }>();

  const toNum = (v?: string) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : null;
  };
  const point = { lat: toNum(lat), lng: toNum(lng), address: address ?? null };
  const origin = { lat: toNum(olat), lng: toNum(olng), address: oaddress ?? null };
  // A second stop only counts when it can actually be placed: RouteMap geocodes an address-only
  // point, so either a pin or an address will do.
  const hasOrigin = origin.lat !== null || !!origin.address;
  const heading = title || tx.locationTitle;
  const hasPoint = point.lat !== null || !!point.address;

  const fromMe = me === '1';
  // The driver's own dot, live while the screen is open; the map draws the route from it to the
  // pin. Disabled entirely when the opener did not ask, so this screen stays permissionless for
  // clients and merchants.
  const driver = useDriverPosition(fromMe);
  // The estimate re-requests when its origin moves in hundred-metre steps, not on every GPS tick.
  const etaOrigin = useCoarsePosition(fromMe ? driver : null, 100);
  // Driving estimate me -> pin, for the footer. Silent when the pin is address-only (no
  // coordinates to route to) or OSRM cannot answer -- the route line still tells the story.
  const eta = useRouteEta(etaOrigin?.lat, etaOrigin?.lng, point.lat, point.lng);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          <Text style={styles.title} numberOfLines={1}>{heading}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        {!hasPoint ? (
          <View style={styles.center}><Text style={styles.muted}>{tx.noLocation}</Text></View>
        ) : (
          <>
            {/* With both ends known, RouteMap draws the street route between them (Google
                Directions, then OSRM, then a dashed straight hop). With only one, the empty stop
                resolves to nothing and it stays a single pin zoomed to the address. */}
            <RouteMap
              pickup={hasOrigin
                ? {
                  ...origin, label: '🏪', title: otitle || tx.merchant, color: '#0b2a6b',
                  imageUrl: oimg ?? null,
                }
                : { lat: null, lng: null, address: null, label: '', title: '', color: '#16a34a' }}
              client={{ ...point, label: '📍', title: heading, color: '#16a34a', imageUrl: img ?? null }}
              driver={fromMe ? driver : null}
            />
            {address || (hasOrigin && oaddress) || eta ? (
              <View style={styles.footer}>
                {eta ? <Text style={styles.eta}>⏱️ {formatEta(eta)}</Text> : null}
                {hasOrigin && oaddress ? (
                  <>
                    <Text style={styles.footerLabel}>{otitle || tx.merchant}</Text>
                    <Text style={styles.footerText}>{oaddress}</Text>
                  </>
                ) : null}
                {address ? (
                  <>
                    <Text style={styles.footerLabel}>{hasOrigin ? tx.deliverAt : tx.addressLabel}</Text>
                    <Text style={styles.footerText}>{address}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
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
  footer: { padding: 16, gap: 2, borderTopWidth: 1, borderTopColor: t.border },
  eta: { color: t.text, fontWeight: '800', fontSize: 14 },
  footerLabel: { marginTop: 6, fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  footerText: { fontSize: 15, fontWeight: '600', color: t.text, marginTop: 3 },
});
