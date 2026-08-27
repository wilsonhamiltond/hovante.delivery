import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RouteMap } from '../src/RouteMap';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';

// One point on a map, in the app rather than handing off to Google Maps. Used by both order-detail
// screens: the driver's pickup/dropoff buttons and the client's delivery address.
//
// RouteMap takes two points; the empty one resolves to nothing, so it draws a single marker and
// zooms to it. A point with no coordinates is forward-geocoded from its address by the map itself.
export default function MapScreen() {
  const router = useRouter();
  const { lat, lng, address, title, img, olat, olng, oaddress, otitle, oimg } = useLocalSearchParams<{
    lat?: string; lng?: string; address?: string; title?: string;
    /** The face for the destination pin (the customer's photo). Optional; a pin without one keeps
     *  its numbered teardrop. */
    img?: string;
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
  const heading = title || 'Ubicación';
  const hasPoint = point.lat !== null || !!point.address;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          <Text style={styles.title} numberOfLines={1}>{heading}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        {!hasPoint ? (
          <View style={styles.center}><Text style={styles.muted}>Esta dirección no tiene ubicación.</Text></View>
        ) : (
          <>
            {/* With both ends known, RouteMap draws the street route between them (Google
                Directions, then OSRM, then a dashed straight hop). With only one, the empty stop
                resolves to nothing and it stays a single pin zoomed to the address. */}
            <RouteMap
              pickup={hasOrigin
                ? {
                  ...origin, label: '🏪', title: otitle || 'Comercio', color: '#0b2a6b',
                  imageUrl: oimg ?? null,
                }
                : { lat: null, lng: null, address: null, label: '', title: '', color: '#16a34a' }}
              client={{ ...point, label: '📍', title: heading, color: '#16a34a', imageUrl: img ?? null }}
            />
            {address || (hasOrigin && oaddress) ? (
              <View style={styles.footer}>
                {hasOrigin && oaddress ? (
                  <>
                    <Text style={styles.footerLabel}>{otitle || 'Comercio'}</Text>
                    <Text style={styles.footerText}>{oaddress}</Text>
                  </>
                ) : null}
                {address ? (
                  <>
                    <Text style={styles.footerLabel}>{hasOrigin ? 'Entregar en' : 'Dirección'}</Text>
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
  footerLabel: { marginTop: 6, fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  footerText: { fontSize: 15, fontWeight: '600', color: t.text, marginTop: 3 },
});
