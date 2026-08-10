import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import type { Me } from '../src/api';
import { ExploreHome } from '../src/ExploreHome';
import { GradientBackground, t } from '../src/theme';

// The "Explorar" tab: the full marketplace -- category row and product catalogue. It loads the
// profile the same way /home does, since each tab is its own screen and neither can read the
// other's state.
//
// Clients only, matching the tab bar: the driver variant has no Explorar entry, so a driver can
// only arrive here by deep link, and is sent to their own home instead of a marketplace they
// cannot order from.
export default function ExploreScreen() {
  const { token, signOut } = useAuth();
  const router = useRouter();
  // ?q= arrives when the home screen's search box was submitted, ?companyId=/?companyName= when a
  // merchant was tapped in its carousel -- either way this tab opens already filtered.
  const { q, companyId, companyName } = useLocalSearchParams<{
    q?: string;
    companyId?: string;
    companyName?: string;
  }>();
  // An id is what the catalogue actually filters by, so a merchant with neither is no filter at all.
  const company = companyId && companyName ? { id: companyId, name: companyName } : null;
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      if (!token) return;
      const res = await api.me();
      if (!active) return;
      if (!res.success) { setError(res.message); return; }
      setError(null);
      setProfile(res.data);
    })().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]));

  useEffect(() => {
    if (profile?.isDriver) router.replace('/home');
  }, [profile?.isDriver]);

  if (loading || profile?.isDriver) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (profile) return <ExploreHome profile={profile} initialSearch={q} initialCompany={company} />;

  // Profile failed to load (e.g. session expired): let the user sign out and back in.
  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.title}>No se pudo cargar tu perfil</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={signOut}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
      </View>
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: t.text },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },
  link: { color: t.text, fontWeight: '700', fontSize: 15, marginTop: 8 },
});
