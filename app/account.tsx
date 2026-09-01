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
import { CartButton } from '../src/CartButton';
import { NotificationsButton } from '../src/NotificationsButton';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';
import { LOCALES, LOCALE_LABELS, useLocale, useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    title: string;
    photoPermTitle: string;
    photoPermBody: string;
    imageAlertTitle: string;
    changeAvatar: string;
    driver: string;
    client: string;
    name: string;
    email: string;
    phone: string;
    mainAddress: string;
    noAddress: string;
    myInfo: string;
    addresses: string;
    myVehicle: string;
    products: string;
    categories: string;
    hours: string;
    drivers: string;
    changePassword: string;
    help: string;
    deleteAccount: string;
    language: string;
    signOut: string;
  }
> = {
  es: {
    title: 'Mi cuenta',
    photoPermTitle: 'Permiso de fotos',
    photoPermBody: 'Activa el permiso de fotos para cambiar tu imagen.',
    imageAlertTitle: 'Imagen',
    changeAvatar: 'Cambiar imagen de perfil',
    driver: 'Repartidor',
    client: 'Cliente',
    name: 'Nombre',
    email: 'Correo',
    phone: 'Teléfono',
    mainAddress: 'Dirección principal',
    noAddress: 'Sin dirección',
    myInfo: 'Mis datos',
    addresses: 'Direcciones',
    myVehicle: 'Mi vehículo',
    products: 'Productos',
    categories: 'Categorías',
    hours: 'Horario',
    drivers: 'Repartidores',
    changePassword: 'Cambiar contraseña',
    help: 'Ayuda',
    deleteAccount: 'Eliminar cuenta',
    language: 'Idioma',
    signOut: 'Cerrar sesión',
  },
  en: {
    title: 'My account',
    photoPermTitle: 'Photo permission',
    photoPermBody: 'Enable the photo permission to change your picture.',
    imageAlertTitle: 'Image',
    changeAvatar: 'Change profile picture',
    driver: 'Driver',
    client: 'Customer',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    mainAddress: 'Main address',
    noAddress: 'No address',
    myInfo: 'My info',
    addresses: 'Addresses',
    myVehicle: 'My vehicle',
    products: 'Products',
    categories: 'Categories',
    hours: 'Business hours',
    drivers: 'Drivers',
    changePassword: 'Change password',
    help: 'Help',
    deleteAccount: 'Delete account',
    language: 'Language',
    signOut: 'Sign out',
  },
  fr: {
    title: 'Mon compte',
    photoPermTitle: 'Autorisation photos',
    photoPermBody: 'Activez l’autorisation photos pour changer votre image.',
    imageAlertTitle: 'Image',
    changeAvatar: 'Changer la photo de profil',
    driver: 'Livreur',
    client: 'Client',
    name: 'Nom',
    email: 'E-mail',
    phone: 'Téléphone',
    mainAddress: 'Adresse principale',
    noAddress: 'Aucune adresse',
    myInfo: 'Mes informations',
    addresses: 'Adresses',
    myVehicle: 'Mon véhicule',
    products: 'Produits',
    categories: 'Catégories',
    hours: 'Horaires',
    drivers: 'Livreurs',
    changePassword: 'Changer le mot de passe',
    help: 'Aide',
    deleteAccount: 'Supprimer le compte',
    language: 'Langue',
    signOut: 'Se déconnecter',
  },
};

// The "Cuenta" tab: who you are, plus the actions that used to live in the top-right drawer.
export default function AccountScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const tx = useStrings(S);
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
      Alert.alert(tx.photoPermTitle, tx.photoPermBody);
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
      Alert.alert(tx.imageAlertTitle, res.message);
      return;
    }
    // The endpoint answers with the stored image's URL, so there is nothing to refetch.
    if (res.data) setImageUrl(res.data);
  };

  return (
    <GradientBackground>
      <View style={styles.safe}>
        {/* The header carries the top inset itself, so the solid band reaches the screen edge.
            The bell counts the audience this account belongs to, same as its home screen. */}
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.header}>
            <Text style={styles.title}>{tx.title}</Text>
            {/* Only a customer has a cart; a driver or a merchant would be shown a button that
                leads nowhere they can use. */}
            {navVariant === 'client' ? <CartButton /> : null}
            <NotificationsButton audience={navVariant} />
          </View>
        </SafeAreaView>

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
                accessibilityLabel={tx.changeAvatar}
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
                <Text style={styles.name} numberOfLines={1}>{fullName || (isDriver ? tx.driver : tx.client)}</Text>
                {profile?.email ? <Text style={styles.email} numberOfLines={1}>{profile.email}</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>{tx.name}</Text>
              <Text style={styles.value}>{fullName || '—'}</Text>
              <Text style={[styles.label, styles.labelSpaced]}>{tx.email}</Text>
              <Text style={styles.value}>{profile?.email ?? '—'}</Text>
              <Text style={[styles.label, styles.labelSpaced]}>{tx.phone}</Text>
              <Text style={styles.value}>{profile?.phone || '—'}</Text>
              {!isDriver ? (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>{tx.mainAddress}</Text>
                  <Text style={styles.value}>{profile?.address || tx.noAddress}</Text>
                </>
              ) : null}
            </View>

            {/* Language: applies immediately and is remembered on this device. */}
            <View style={styles.card}>
              <Text style={styles.label}>{tx.language}</Text>
              <View style={styles.langRow}>
                {LOCALES.map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setLocale(l)}
                    style={[styles.langPill, locale === l && styles.langPillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: locale === l }}
                  >
                    <Text style={[styles.langPillText, locale === l && styles.langPillTextActive]}>
                      {LOCALE_LABELS[l]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Pressable style={styles.row} onPress={() => router.push('/edit-profile')}>
                <FontAwesome5 name="user-edit" size={15} solid color={t.text} style={styles.rowIcon} />
                <Text style={styles.rowText}>{tx.myInfo}</Text>
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
                    <Text style={styles.rowText}>{tx.addresses}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                </>
              ) : null}
              {isDriver ? (
                <>
                  <Pressable style={styles.row} onPress={() => router.push('/vehicle')}>
                    <FontAwesome5 name="motorcycle" size={16} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>{tx.myVehicle}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                </>
              ) : null}
              {/* Merchants only: the catalogue and its categories, then when the business opens
                  each day of the week. Productos also lives on the tab bar; the row keeps every
                  merchant tool findable from one place. */}
              {profile?.isMerchant ? (
                <>
                  <Pressable style={styles.row} onPress={() => router.push('/merchant-products')}>
                    <FontAwesome5 name="box-open" size={15} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>{tx.products}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                  <Pressable style={styles.row} onPress={() => router.push('/merchant-categories')}>
                    <FontAwesome5 name="tags" size={15} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>{tx.categories}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                  <Pressable style={styles.row} onPress={() => router.push('/business-hours')}>
                    <FontAwesome5 name="clock" size={16} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>{tx.hours}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                  {/* The merchant's fleet: linked drivers and the public-orders switch. */}
                  <Pressable style={styles.row} onPress={() => router.push('/merchant-drivers')}>
                    <FontAwesome5 name="motorcycle" size={15} solid color={t.text} style={styles.rowIcon} />
                    <Text style={styles.rowText}>{tx.drivers}</Text>
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
                    <Text style={styles.rowText}>{tx.changePassword}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                  <View style={styles.rowDivider} />
                </>
              ) : null}
              <Pressable style={styles.row} onPress={() => router.push('/help')}>
                <FontAwesome5 name="question-circle" size={17} solid color={t.text} style={styles.rowIcon} />
                <Text style={styles.rowText}>{tx.help}</Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
              <View style={styles.rowDivider} />
              {/* Account deletion (App Store 5.1.1(v)): in the same card as every other account
                  action so it is findable, in danger ink so it is not mistaken for one of them.
                  The row only opens the screen that explains and confirms -- nothing is deleted
                  from here. */}
              <Pressable style={styles.row} onPress={() => router.push('/delete-account')}>
                <FontAwesome5 name="user-slash" size={14} solid color={t.danger} style={styles.rowIcon} />
                <Text style={[styles.rowText, styles.rowTextDanger]}>{tx.deleteAccount}</Text>
                <Text style={[styles.rowChevron, styles.rowTextDanger]}>›</Text>
              </Pressable>
            </View>

            <Pressable style={styles.logout} onPress={signOut}>
              <FontAwesome5 name="sign-out-alt" size={16} solid color={t.danger} />
              <Text style={styles.logoutText}>{tx.signOut}</Text>
            </Pressable>
          </ScrollView>
        )}

        <BottomNav active="account" variant={navVariant} />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  // Solid, matching the bottom nav, so the header and the tab bar frame the screen as a pair;
  // the border mirrors the nav's top border.
  headerSafe: { backgroundColor: t.bar, borderBottomWidth: 1, borderBottomColor: t.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '900', color: t.text },
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

  langRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  langPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.card },
  langPillActive: { backgroundColor: t.accent, borderColor: t.accent },
  langPillText: { color: t.text, fontWeight: '700' },
  langPillTextActive: { color: t.onAccent },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 2 },
  rowDivider: { height: 1, backgroundColor: t.border, marginVertical: 12 },
  rowIcon: { width: 22, textAlign: 'center' },
  rowText: { flex: 1, fontSize: 16, color: t.text, fontWeight: '700' },
  rowTextDanger: { color: t.danger },
  rowChevron: { fontSize: 20, fontWeight: '800', color: t.text },

  // Danger, the same way the address book marks its delete: the card shape stays, only the ink and
  // the border turn red. The solid #dc2626 fill is kept for CONFIRMING a destructive action
  // ("Rechazar", "Cancelar pedido"), and signing out is the entry point, not the confirmation.
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.danger },
  logoutText: { fontSize: 16, color: t.danger, fontWeight: '800' },
});
