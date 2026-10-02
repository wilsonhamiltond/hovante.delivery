import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { TextInput } from '../src/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from '../src/api';
import type { MerchantDriver } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BackButton } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { ConfirmDialog } from '../src/ConfirmDialog';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    title: string;
    searchMinChars: string;
    driverFallback: string;
    publicOrders: string;
    publicOn: string;
    publicOff: string;
    yourTeam: string;
    emptyTeam: string;
    pendingCode: (code: string) => string;
    pendingHint: string;
    invited: string;
    removeLabel: (name: string) => string;
    remove: string;
    addDriver: string;
    searchPlaceholder: string;
    searchDriver: string;
    noMatches: string;
    onYourTeam: string;
    addLabel: (name: string) => string;
    add: string;
    removeTitle: string;
    removeMessage: (name: string) => string;
    thisDriver: string;
    removeConfirm: string;
    online: string;
    offline: string;
    lastSeen: (ago: string) => string;
    ago: (minutes: number) => string;
  }
> = {
  es: {
    title: 'Repartidores',
    searchMinChars: 'Escribe al menos 2 caracteres para buscar.',
    driverFallback: 'Repartidor',
    publicOrders: 'Pedidos públicos',
    publicOn: 'Cualquier repartidor de la plataforma puede tomar tus pedidos.',
    publicOff: 'Solo los repartidores de tu equipo pueden ver y tomar tus pedidos.',
    yourTeam: 'Tu equipo',
    emptyTeam: 'Aún no tienes repartidores en tu equipo. Búscalos abajo por nombre, teléfono, correo o cédula.',
    pendingCode: (code) => `Pendiente · código ${code}`,
    pendingHint: 'Se lo enviamos por correo al repartidor; también puedes compartírselo. Al escribirlo en su app se une a tu equipo.',
    invited: 'Invitado',
    removeLabel: (name) => `Quitar a ${name}`,
    remove: 'Quitar',
    addDriver: 'Agregar repartidor',
    searchPlaceholder: 'Nombre, teléfono, correo o cédula',
    searchDriver: 'Buscar repartidor',
    noMatches: 'Ningún repartidor coincide con la búsqueda.',
    onYourTeam: 'En tu equipo',
    addLabel: (name) => `Agregar a ${name}`,
    add: 'Agregar',
    removeTitle: 'Quitar repartidor',
    removeMessage: (name) => `¿Quitar a "${name}" de tu equipo?`,
    thisDriver: 'este repartidor',
    removeConfirm: 'Sí, quitar',
    online: 'En línea',
    offline: 'Desconectado',
    lastSeen: (ago) => `Desconectado · visto ${ago}`,
    ago: (m) => (m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min`
      : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`),
  },
  en: {
    title: 'Drivers',
    searchMinChars: 'Type at least 2 characters to search.',
    driverFallback: 'Driver',
    publicOrders: 'Public orders',
    publicOn: 'Any driver on the platform can take your orders.',
    publicOff: 'Only the drivers on your team can see and take your orders.',
    yourTeam: 'Your team',
    emptyTeam: 'You have no drivers on your team yet. Search for them below by name, phone, email, or ID number.',
    pendingCode: (code) => `Pending · code ${code}`,
    pendingHint: 'We emailed it to the driver; you can also share it yourself. Typing it in their app joins them to your team.',
    invited: 'Invited',
    removeLabel: (name) => `Remove ${name}`,
    remove: 'Remove',
    addDriver: 'Add driver',
    searchPlaceholder: 'Name, phone, email, or ID number',
    searchDriver: 'Search for a driver',
    noMatches: 'No drivers match your search.',
    onYourTeam: 'On your team',
    addLabel: (name) => `Add ${name}`,
    add: 'Add',
    removeTitle: 'Remove driver',
    removeMessage: (name) => `Remove "${name}" from your team?`,
    thisDriver: 'this driver',
    removeConfirm: 'Yes, remove',
    online: 'Online',
    offline: 'Offline',
    lastSeen: (ago) => `Offline · seen ${ago}`,
    ago: (m) => (m < 1 ? 'just now' : m < 60 ? `${m} min ago`
      : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`),
  },
  fr: {
    title: 'Livreurs',
    searchMinChars: 'Saisissez au moins 2 caractères pour rechercher.',
    driverFallback: 'Livreur',
    publicOrders: 'Commandes publiques',
    publicOn: 'N’importe quel livreur de la plateforme peut prendre vos commandes.',
    publicOff: 'Seuls les livreurs de votre équipe peuvent voir et prendre vos commandes.',
    yourTeam: 'Votre équipe',
    emptyTeam: 'Vous n’avez pas encore de livreurs dans votre équipe. Recherchez-les ci-dessous par nom, téléphone, e-mail ou numéro de pièce d’identité.',
    pendingCode: (code) => `En attente · code ${code}`,
    pendingHint: 'Nous l’avons envoyé par e-mail au livreur ; vous pouvez aussi le lui partager. En le saisissant dans son application, il rejoint votre équipe.',
    invited: 'Invité',
    removeLabel: (name) => `Retirer ${name}`,
    remove: 'Retirer',
    addDriver: 'Ajouter un livreur',
    searchPlaceholder: 'Nom, téléphone, e-mail ou pièce d’identité',
    searchDriver: 'Rechercher un livreur',
    noMatches: 'Aucun livreur ne correspond à la recherche.',
    onYourTeam: 'Dans votre équipe',
    addLabel: (name) => `Ajouter ${name}`,
    add: 'Ajouter',
    removeTitle: 'Retirer le livreur',
    removeMessage: (name) => `Retirer "${name}" de votre équipe ?`,
    thisDriver: 'ce livreur',
    removeConfirm: 'Oui, retirer',
    online: 'En ligne',
    offline: 'Hors ligne',
    lastSeen: (ago) => `Hors ligne · vu ${ago}`,
    ago: (m) => (m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min`
      : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`),
  },
};

// The merchant's fleet ("Repartidores"), reached from Cuenta. Two things live here because they
// answer the same question -- who delivers my orders:
//  - the "pedidos públicos" switch: whether released orders enter the public driver pool;
//  - the team list: drivers linked to this merchant, who are the ONLY ones to see its orders
//    when the switch is off (and who see nothing but their fleets' orders in any case).
// Adding a driver is an invitation: the server hands back a code, shown on the pending card,
// that the driver types on their Comercios screen. Until then the row is "pendiente" and the
// driver is not on the team yet.
export default function MerchantDriversScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<MerchantDriver[]>([]);
  const [allowPublic, setAllowPublic] = useState<boolean | null>(null);
  const [savingPublic, setSavingPublic] = useState(false);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MerchantDriver[] | null>(null);
  // Which row is mid-action (add/remove), so only its own button shows a spinner.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<MerchantDriver | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const [drivers, settings] = await Promise.all([
      api.merchantDrivers(),
      api.merchantDeliverySettings(),
    ]);
    if (drivers.success) setTeam(drivers.data ?? []);
    if (settings.success) setAllowPublic(settings.data?.allowPublicOrders ?? true);
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]));

  const togglePublic = async (value: boolean) => {
    setAllowPublic(value);
    setSavingPublic(true);
    const res = await api.saveMerchantDeliverySettings({ allowPublicOrders: value });
    setSavingPublic(false);
    if (!res.success) {
      // Roll the switch back: showing a state the server refused would be a lie.
      setAllowPublic(!value);
      setNotice({ tone: 'error', message: res.message });
    }
  };

  const search = async () => {
    const term = query.trim();
    if (term.length < 2) {
      setNotice({ tone: 'error', message: tx.searchMinChars });
      return;
    }
    setSearching(true);
    const res = await api.searchMerchantDrivers(term);
    setSearching(false);
    if (res.success) setResults(res.data ?? []);
    else setNotice({ tone: 'error', message: res.message });
  };

  const add = async (driver: MerchantDriver) => {
    setBusyId(driver.driverUserId);
    const res = await api.linkMerchantDriver(driver.driverUserId);
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    // The invitation lands on the team list (as pending, with its code), the search result
    // flips to "invitado", and the merchant is told the code to pass along.
    await load();
    setResults((prev) => prev?.map((r) =>
      r.driverUserId === driver.driverUserId
        ? { ...r, linked: true, status: res.data?.status ?? 'PENDING' }
        : r) ?? null);
    if (res.message) setNotice({ tone: 'success', message: res.message });
  };

  const remove = async (driver: MerchantDriver) => {
    setToRemove(null);
    setBusyId(driver.driverUserId);
    const res = await api.unlinkMerchantDriver(driver.driverUserId);
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    await load();
    setResults((prev) => prev?.map((r) =>
      r.driverUserId === driver.driverUserId ? { ...r, linked: false, status: null } : r) ?? null);
  };

  const driverLine = (d: MerchantDriver) =>
    [d.phone, d.email, d.document].filter(Boolean).join(' · ') || tx.driverFallback;

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
        <Text style={styles.title}>{tx.title}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {/* The public-pool switch. Off = only the team below sees this merchant's orders. */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{tx.publicOrders}</Text>
                <Text style={styles.hint}>
                  {allowPublic ? tx.publicOn : tx.publicOff}
                </Text>
              </View>
              {savingPublic
                ? <ActivityIndicator color={t.text} />
                : (
                  <Switch
                    value={allowPublic ?? true}
                    onValueChange={togglePublic}
                    trackColor={{ false: 'rgba(255,255,255,0.25)', true: '#16a34a' }}
                    thumbColor="#ffffff"
                  />
                )}
            </View>
          </View>

          {/* The team. */}
          <Text style={styles.sectionTitle}>{tx.yourTeam}</Text>
          {team.length === 0 ? (
            <Text style={styles.empty}>
              {tx.emptyTeam}
            </Text>
          ) : team.map((d) => (
            <View key={d.driverUserId} style={styles.card}>
              <View style={styles.driverRow}>
                <FontAwesome5 name="motorcycle" size={16} color={t.text} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{d.name || tx.driverFallback}</Text>
                  <Text style={styles.hint}>{driverLine(d)}</Text>
                  {/* Whether the driver is working right now -- with the switch off, the team is
                      the only one who can take an order, so this is what tells the merchant
                      whether anyone will. */}
                  {d.status === 'ACCEPTED' ? (
                    <View style={styles.presenceRow}>
                      <View style={[styles.presenceDot, d.isOnline ? styles.presenceOn : styles.presenceOff]} />
                      <Text style={d.isOnline ? styles.presenceOnText : styles.hint}>
                        {d.isOnline
                          ? tx.online
                          : d.lastSeenAt
                            ? tx.lastSeen(tx.ago(Math.floor((Date.now() - Date.parse(d.lastSeenAt)) / 60000)))
                            : tx.offline}
                      </Text>
                    </View>
                  ) : null}
                  {d.status === 'PENDING' && d.inviteCode ? (
                    <>
                      <Text style={styles.pendingCode}>{tx.pendingCode(d.inviteCode)}</Text>
                      <Text style={styles.hint}>{tx.pendingHint}</Text>
                    </>
                  ) : null}
                </View>
                {busyId === d.driverUserId
                  ? <ActivityIndicator size="small" color={t.text} />
                  : (
                    <Pressable
                      style={[styles.pill, styles.pillDanger]}
                      onPress={() => setToRemove(d)}
                      disabled={busyId != null}
                      accessibilityRole="button"
                      accessibilityLabel={tx.removeLabel(d.name ?? tx.driverFallback.toLowerCase())}
                    >
                      <Text style={styles.pillDangerText}>{tx.remove}</Text>
                    </Pressable>
                  )}
              </View>
            </View>
          ))}

          {/* Search + add. */}
          <Text style={styles.sectionTitle}>{tx.addDriver}</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder={tx.searchPlaceholder}
              placeholderTextColor={t.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={search}
              returnKeyType="search"
            />
            <Pressable
              style={[styles.searchBtn, searching && styles.disabled]}
              onPress={search}
              disabled={searching}
              accessibilityRole="button"
              accessibilityLabel={tx.searchDriver}
            >
              {searching
                ? <ActivityIndicator size="small" color={t.onAccent} />
                : <FontAwesome5 name="search" size={14} color={t.onAccent} />}
            </Pressable>
          </View>

          {results != null && results.length === 0 ? (
            <Text style={styles.empty}>{tx.noMatches}</Text>
          ) : null}
          {(results ?? []).map((d) => (
            <View key={d.driverUserId} style={styles.card}>
              <View style={styles.driverRow}>
                <FontAwesome5 name="motorcycle" size={16} color={t.text} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{d.name || tx.driverFallback}</Text>
                  <Text style={styles.hint}>{driverLine(d)}</Text>
                </View>
                {busyId === d.driverUserId
                  ? <ActivityIndicator size="small" color={t.text} />
                  : d.linked ? (
                    <Text style={d.status === 'PENDING' ? styles.pendingBadge : styles.linkedBadge}>
                      {d.status === 'PENDING' ? tx.invited : tx.onYourTeam}
                    </Text>
                  ) : (
                    <Pressable
                      style={[styles.pill, styles.pillAccent]}
                      onPress={() => add(d)}
                      disabled={busyId != null}
                      accessibilityRole="button"
                      accessibilityLabel={tx.addLabel(d.name ?? tx.driverFallback.toLowerCase())}
                    >
                      <Text style={styles.pillAccentText}>{tx.add}</Text>
                    </Pressable>
                  )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={toRemove != null}
        title={tx.removeTitle}
        message={tx.removeMessage(toRemove?.name || tx.thisDriver)}
        confirmLabel={tx.removeConfirm}
        onConfirm={() => { if (toRemove) remove(toRemove); }}
        onCancel={() => setToRemove(null)}
      />

      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 24, maxWidth: 520, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  hint: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.text, marginTop: 10 },
  empty: { color: t.textMuted, fontSize: 14 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverName: { fontSize: 15, fontWeight: '700', color: t.text },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  pillDanger: { borderColor: t.danger, backgroundColor: t.card },
  pillDangerText: { color: t.danger, fontSize: 13, fontWeight: '800' },
  pillAccent: { borderColor: t.accent, backgroundColor: t.accent },
  pillAccentText: { color: t.onAccent, fontSize: 13, fontWeight: '800' },
  linkedBadge: { color: t.success, fontSize: 12, fontWeight: '800' },
  pendingBadge: { color: t.textMuted, fontSize: 12, fontWeight: '800' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  presenceOn: { backgroundColor: '#22c55e' },
  presenceOff: { backgroundColor: '#94a3b8' },
  presenceOnText: { color: t.success, fontSize: 12, fontWeight: '800' },
  pendingCode: { color: t.text, fontSize: 13, fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text,
  },
  searchBtn: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: t.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
});
