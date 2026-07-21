import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RouteMap } from '../src/RouteMap';
import { GradientBackground, t } from '../src/theme';

// One point on a map, in the app rather than handing off to Google Maps. Used by both order-detail
// screens: the driver's pickup/dropoff buttons and the client's delivery address.
//
// RouteMap takes two points; the empty one resolves to nothing, so it draws a single marker and
// zooms to it. A point with no coordinates is forward-geocoded from its address by the map itself.
export default function MapScreen() {
  const router = useRouter();
  const { lat, lng, address, title } = useLocalSearchParams<{
    lat?: string; lng?: string; address?: string; title?: string;
  }>();

  const toNum = (v?: string) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : null;
  };
  const point = { lat: toNum(lat), lng: toNum(lng), address: address ?? null };
  const heading = title || 'Ubicación';
  const hasPoint = point.lat !== null || !!point.address;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={8}>
            <Text style={styles.back}>‹ Atrás</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{heading}</Text>
          <View style={{ width: 56 }} />
        </View>

        {!hasPoint ? (
          <View style={styles.center}><Text style={styles.muted}>Esta dirección no tiene ubicación.</Text></View>
        ) : (
          <>
            <RouteMap
              pickup={{ lat: null, lng: null, address: null, label: '', title: '', color: '#16a34a' }}
              client={{ ...point, label: '📍', title: heading, color: '#16a34a' }}
            />
            {address ? (
              <View style={styles.footer}>
                <Text style={styles.footerLabel}>Dirección</Text>
                <Text style={styles.footerText}>{address}</Text>
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
  back: { color: t.text, fontWeight: '800', fontSize: 16, width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: t.textMuted, textAlign: 'center' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: t.border },
  footerLabel: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  footerText: { fontSize: 15, fontWeight: '600', color: t.text, marginTop: 3 },
});
