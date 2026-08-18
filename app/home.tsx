import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import type { Me } from '../src/api';
import { ClientHome } from '../src/ClientHome';
import { DriverHome } from '../src/DriverHome';
import { MerchantHome } from '../src/MerchantHome';
import { LogoSplash } from '../src/LogoSplash';
import { GradientBackground, t } from '../src/theme';

// Routes the home by role: a merchant (ERP account) gets their orders screen, a driver gets
// DriverHome (the pool map), a customer gets ClientHome (the marketplace). Each screen loads its
// own data; this only resolves who is signed in.
export default function HomeScreen() {
  const { token, signOut } = useAuth();
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped to ask for the profile again after a failed attempt; see the retry effect below.
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      if (!token) return;
      const res = await api.me();
      if (!active) return;
      if (!res.success) return;
      setProfile(res.data);
    })().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, attempt]));

  // A profile that will not load with the session still held is the network, not the token: an
  // expired token has already signed the user out by the time it gets here (api's 401 handler), so
  // there is nothing to tell them about. Retry quietly behind the splash instead, and the app comes
  // back on its own when the connection does.
  useEffect(() => {
    if (loading || profile || !token) return;
    const id = setTimeout(() => setAttempt((n) => n + 1), 4000);
    return () => clearTimeout(id);
  }, [loading, profile, token, attempt]);

  if (loading) return <LogoSplash />;

  // Every role signs out from its "Cuenta" tab, so no home needs the handler. The merchant check
  // goes first: an ERP account has no delivery contact, so its driver/client flags are both false
  // and it would otherwise fall through to the marketplace.
  if (profile?.isMerchant) return <MerchantHome profile={profile} />;
  if (profile?.isDriver) return <DriverHome profile={profile} />;

  // An ERP account WITHOUT the "Acceso App Delivery" flag gets no home at all: refused clearly
  // rather than left shopping the marketplace with an account that has no delivery contact.
  if (profile && !profile.isClient && !profile.isDriver) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Esta cuenta no tiene acceso a la app</Text>
          <Text style={styles.error}>
            Pide a tu administrador que active "Acceso App Delivery" para tu usuario.
          </Text>
          <Pressable onPress={signOut}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
        </View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  if (profile && !profile.isDriver) return <ClientHome profile={profile} />;

  // No profile yet: an expired session is already on its way to /login and a failed request is
  // being retried above, so there is nothing to ask of the user -- just the logo until one of the
  // two resolves.
  return <LogoSplash />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: t.text },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },
  link: { color: t.text, fontWeight: '700', fontSize: 15, marginTop: 8 },
});
