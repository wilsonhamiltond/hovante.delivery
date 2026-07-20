import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import type { Me } from '../src/api';
import { ClientHome } from '../src/ClientHome';
import { DriverHome } from '../src/DriverHome';

// Routes the home by role: a driver gets DriverHome (their route), a customer gets ClientHome (the
// marketplace). Each screen loads its own data; this only resolves who is signed in.
export default function HomeScreen() {
  const { token, signOut } = useAuth();
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      </SafeAreaView>
    );
  }

  if (profile?.isDriver) return <DriverHome profile={profile} onSignOut={signOut} />;
  if (profile && !profile.isDriver) return <ClientHome profile={profile} onSignOut={signOut} />;

  // Profile failed to load (e.g. session expired): let the user sign out and back in.
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.title}>No se pudo cargar tu perfil</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={signOut}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  link: { color: '#2563eb', fontWeight: '700', fontSize: 15, marginTop: 8 },
});
