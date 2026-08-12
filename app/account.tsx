import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import type { Me } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

// The "Cuenta" tab: who you are, plus the actions that used to live in the top-right drawer.
export default function AccountScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  // Seeded from the last fetch rather than null: the tab bar below renders on every pass, and a
  // null profile reads as a client, so a merchant opening Cuenta watched their bar turn into the
  // client one until me() came back. Whatever arrives replaces it.
  const [profile, setProfile] = useState<Me | null>(api.cachedMe());
  const [loading, setLoading] = useState(true);
  // The picture is uploading. Shown over the avatar so the tap has visible effect straight away.
  const [uploading, setUploading] = useState(false);
  // Set the moment an upload succeeds, so the new picture appears without waiting for a refetch.
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.me().then((res) => {
      if (!active || !res.success) return;
      setProfile(res.data);
      setImageUrl(res.data?.imageUrl ?? null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  // Name and surname are separate fields on the contact; join them for display.
  const fullName = [profile?.name, profile?.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  const initial = (fullName || profile?.email || '?').charAt(0).toUpperCase();
  // Shared by every role: the tab bar and the extra rows adapt to who is signed in.
  const isDriver = !!profile?.isDriver;
  // A merchant kept the client bar here, which offered them Explorar and Pedidos (screens their
  // account cannot use) and dropped the Historial tab the moment they opened Cuenta.
  const navVariant = profile?.isMerchant ? 'merchant' : isDriver ? 'driver' : 'client';

  // Pick a picture and upload it. The library is asked for a square crop, and the result is
  // downscaled and re-encoded before sending -- a modern phone photo is several megabytes, which is
  // slow on mobile data and far more detail than a 56px avatar can show.
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso de fotos', 'Activa el permiso de fotos para cambiar tu imagen.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    setUploading(true);
    const res = await api.uploadProfileImage(
      asset.uri,
      asset.mimeType ?? 'image/jpeg',
      asset.fileName ?? 'perfil.jpg',
    );
    setUploading(false);

    if (!res.success) {
      Alert.alert('Imagen', res.message);
      return;
    }
    // The endpoint answers with the stored image's URL, so there is nothing to refetch.
    if (res.data) setImageUrl(res.data);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}><Text style={styles.title}>Mi cuenta</Text></View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.profile}>
              {/* The whole avatar is the control, with the pencil as the affordance: a 20px badge
                  is a hard target on a phone, and tapping your own picture is the gesture people
                  already expect. */}
              <Pressable
                onPress={pickImage}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Cambiar imagen de perfil"
              >
                <View style={styles.avatar}>
                  {imageUrl
                    ? <Image source={{ uri: imageUrl }} style={styles.avatarImage} />
                    : <Text style={styles.avatarText}>{initial}</Text>}
                  {uploading ? (
                    <View style={styles.avatarBusy}><ActivityIndicator color={t.text} /></View>
                  ) : null}
                </View>
                <View style={styles.avatarBadge}>
                  <FontAwesome5 name="pencil-alt" size={10} solid color={t.onAccent} />
                </View>
              </Pressable>
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
              <Pressable style={styles.row} onPress={() => router.push('/edit-profile')}>
                <FontAwesome5 name="user-edit" size={15} solid color={t.text} style={styles.rowIcon} />
                <Text style={styles.rowText}>Mis datos</Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
              <View style={styles.rowDivider} />
              {/* Clients only, like the "Dirección principal" field above: a driver has no address
                  book, and their tab bar carries no Direcciones tab either. Same icon as that tab
                  so the two routes into the same screen read as the same place. */}
              {!isDriver ? (
                <>
                  <Pressable style={styles.row} onPress={() => router.push('/addresses')}>
                    <FontAwesome5 name="map-marker-alt" size={17} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>Direcciones</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                </>
              ) : null}
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
              {/* Shown to both roles -- a driver's account is as worth protecting as a customer's --
                  but hidden for an account created through Google, Facebook or Apple: it has no
                  password of its own to change, so the row would only lead to a dead end.
                  Explicitly `!== false`, not truthiness: an API older than the hasPassword field
                  omits it, and treating that as "no password" hid the row from everyone. Showing it
                  is the safe default -- the server still refuses a social account, with a message
                  that says so. */}
              {profile?.hasPassword !== false ? (
                <>
                  <Pressable style={styles.row} onPress={() => router.push('/change-password')}>
                    <FontAwesome5 name="lock" size={16} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>Cambiar contraseña</Text>
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

        <BottomNav active="account" variant={navVariant} />
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
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  // Covers the picture while the upload is in flight, rather than sitting beside it.
  avatarBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  // Sits on the rim, outside the avatar's overflow clip, so it survives a round picture.
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: t.accent, borderWidth: 2, borderColor: '#1d4ed8',
    justifyContent: 'center', alignItems: 'center',
  },
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
