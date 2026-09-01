import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
  },
};

// The merchant's fleet ("Repartidores"), reached from Cuenta. Two things live here because they
// answer the same question -- who delivers my orders:
//  - the "pedidos públicos" switch: whether released orders enter the public driver pool;
//  - the team list: drivers linked to this merchant, who are the ONLY ones to see its orders
//    when the switch is off (and who see nothing but their fleets' orders in any case).
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
    // The result row lands on the team, and the search result flips to "ya en tu equipo".
    await load();
    setResults((prev) => prev?.map((r) =>
      r.driverUserId === driver.driverUserId ? { ...r, linked: true } : r) ?? null);
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
      r.driverUserId === driver.driverUserId ? { ...r, linked: false } : r) ?? null);
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
                    <Text style={styles.linkedBadge}>{tx.onYourTeam}</Text>
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
