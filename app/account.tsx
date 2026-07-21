import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import type { Me } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

// The "Cuenta" tab: who you are, plus the actions that used to live in the top-right drawer.
export default function AccountScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.me().then((res) => { if (active && res.success) setProfile(res.data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  // Name and surname are separate fields on the contact; join them for display.
  const fullName = [profile?.name, profile?.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  const initial = (fullName || profile?.email || '?').charAt(0).toUpperCase();
  // Shared by both roles: the tab bar and the extra rows adapt to who is signed in.
  const isDriver = !!profile?.isDriver;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}><Text style={styles.title}>Mi cuenta</Text></View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.profile}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{fullName || (isDriver ? 'Repartidor' : 'Cliente')}</Text>
                {profile?.email ? <Text style={styles.email} numberOfLines={1}>{profile.email}</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Nombre</Text>
              <Text style={styles.value}>{fullName || '—'}</Text>
              <Text style={[styles.label, styles.labelSpaced]}>Correo</Text>
              <Text style={styles.value}>{profile?.email ?? '—'}</Text>
              <Text style={[styles.label, styles.labelSpaced]}>Teléfono</Text>
              <Text style={styles.value}>{profile?.phone || '—'}</Text>
              {!isDriver ? (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>Dirección principal</Text>
                  <Text style={styles.value}>{profile?.address || 'Sin dirección'}</Text>
                </>
              ) : null}
            </View>

            <View style={styles.card}>
              {isDriver ? (
                <>
                  <Pressable style={styles.row} onPress={() => Alert.alert('Mi vehículo', 'Disponible próximamente.')}>
                    <FontAwesome5 name="motorcycle" size={16} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>Mi vehículo</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                </>
              ) : null}
              <Pressable style={styles.row} onPress={() => router.push('/help')}>
                <FontAwesome5 name="question-circle" size={17} solid color={t.text} style={styles.rowIcon} />
                <Text style={styles.rowText}>Ayuda</Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
            </View>

            <Pressable style={styles.logout} onPress={signOut}>
              <FontAwesome5 name="sign-out-alt" size={16} solid color={t.text} />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </ScrollView>
        )}

        <BottomNav active="account" variant={isDriver ? 'driver' : 'client'} />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: t.text, fontSize: 22, fontWeight: '900' },
  name: { fontSize: 18, fontWeight: '800', color: t.text },
  email: { fontSize: 13, color: t.textMuted, marginTop: 2 },

  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16 },
  label: { fontSize: 12, fontWeight: '800', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  labelSpaced: { marginTop: 14 },
  value: { fontSize: 15, color: t.text, marginTop: 4, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 2 },
  rowDivider: { height: 1, backgroundColor: t.border, marginVertical: 12 },
  rowIcon: { width: 22, textAlign: 'center' },
  rowText: { flex: 1, fontSize: 16, color: t.text, fontWeight: '700' },
  rowChevron: { fontSize: 20, fontWeight: '800', color: t.text },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
  logoutText: { fontSize: 16, color: t.text, fontWeight: '800' },
});
