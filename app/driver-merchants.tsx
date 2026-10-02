import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from '../src/keyboard';
import { TextInput } from '../src/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from '../src/api';
import type { DriverMerchant } from '../src/api';
import { GradientBackground, t } from '../src/theme';
import { BackButton } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { ConfirmDialog } from '../src/ConfirmDialog';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    title: string;
    intro: string;
    merchantFallback: string;
    yourMerchants: string;
    emptyMerchants: string;
    pendingInvites: string;
    pending: string;
    emptyPending: string;
    pendingHint: string;
    codePlaceholder: string;
    codeRequired: string;
    accept: string;
    acceptLabel: (name: string) => string;
    decline: string;
    declineLabel: (name: string) => string;
    declineTitle: string;
    declineMessage: (name: string) => string;
    declineConfirm: string;
    leave: string;
    leaveLabel: (name: string) => string;
    leaveTitle: string;
    leaveMessage: (name: string) => string;
    leaveConfirm: string;
    thisMerchant: string;
  }
> = {
  es: {
    title: 'Comercios',
    intro: 'Cuando perteneces al equipo de un comercio, solo ves y tomas sus pedidos. Sin equipo, ves los pedidos públicos de todos los comercios.',
    merchantFallback: 'Comercio',
    yourMerchants: 'Tus comercios',
    emptyMerchants: 'No perteneces al equipo de ningún comercio. Trabajas con los pedidos públicos.',
    pendingInvites: 'Invitaciones pendientes',
    pending: 'Pendiente',
    emptyPending: 'No tienes invitaciones pendientes.',
    pendingHint: 'Te enviamos el código de invitación por correo (o pídeselo al comercio). Escríbelo aquí para unirte a su equipo.',
    codePlaceholder: 'Código',
    codeRequired: 'Escribe el código de invitación.',
    accept: 'Aceptar',
    acceptLabel: (name) => `Aceptar la invitación de ${name}`,
    decline: 'Rechazar',
    declineLabel: (name) => `Rechazar la invitación de ${name}`,
    declineTitle: 'Rechazar invitación',
    declineMessage: (name) => `¿Rechazar la invitación de "${name}"?`,
    declineConfirm: 'Sí, rechazar',
    leave: 'Salir',
    leaveLabel: (name) => `Salir del equipo de ${name}`,
    leaveTitle: 'Salir del equipo',
    leaveMessage: (name) => `¿Salir del equipo de "${name}"? Dejarás de ver sus pedidos.`,
    leaveConfirm: 'Sí, salir',
    thisMerchant: 'este comercio',
  },
  en: {
    title: 'Merchants',
    intro: 'When you belong to a merchant’s team you only see and take their orders. With no team, you see every merchant’s public orders.',
    merchantFallback: 'Merchant',
    yourMerchants: 'Your merchants',
    emptyMerchants: 'You are not on any merchant’s team. You work the public orders.',
    pendingInvites: 'Pending invitations',
    pending: 'Pending',
    emptyPending: 'You have no pending invitations.',
    pendingHint: 'We emailed you the invitation code (or ask the merchant for it). Type it here to join their team.',
    codePlaceholder: 'Code',
    codeRequired: 'Type the invitation code.',
    accept: 'Accept',
    acceptLabel: (name) => `Accept the invitation from ${name}`,
    decline: 'Decline',
    declineLabel: (name) => `Decline the invitation from ${name}`,
    declineTitle: 'Decline invitation',
    declineMessage: (name) => `Decline the invitation from "${name}"?`,
    declineConfirm: 'Yes, decline',
    leave: 'Leave',
    leaveLabel: (name) => `Leave ${name}’s team`,
    leaveTitle: 'Leave team',
    leaveMessage: (name) => `Leave "${name}"’s team? You will stop seeing their orders.`,
    leaveConfirm: 'Yes, leave',
    thisMerchant: 'this merchant',
  },
  fr: {
    title: 'Commerces',
    intro: 'Quand vous faites partie de l’équipe d’un commerce, vous ne voyez et ne prenez que ses commandes. Sans équipe, vous voyez les commandes publiques de tous les commerces.',
    merchantFallback: 'Commerce',
    yourMerchants: 'Vos commerces',
    emptyMerchants: 'Vous ne faites partie de l’équipe d’aucun commerce. Vous travaillez avec les commandes publiques.',
    pendingInvites: 'Invitations en attente',
    pending: 'En attente',
    emptyPending: 'Vous n’avez aucune invitation en attente.',
    pendingHint: 'Nous vous avons envoyé le code d’invitation par e-mail (ou demandez-le au commerce). Saisissez-le ici pour rejoindre son équipe.',
    codePlaceholder: 'Code',
    codeRequired: 'Saisissez le code d’invitation.',
    accept: 'Accepter',
    acceptLabel: (name) => `Accepter l’invitation de ${name}`,
    decline: 'Refuser',
    declineLabel: (name) => `Refuser l’invitation de ${name}`,
    declineTitle: 'Refuser l’invitation',
    declineMessage: (name) => `Refuser l’invitation de « ${name} » ?`,
    declineConfirm: 'Oui, refuser',
    leave: 'Quitter',
    leaveLabel: (name) => `Quitter l’équipe de ${name}`,
    leaveTitle: 'Quitter l’équipe',
    leaveMessage: (name) => `Quitter l’équipe de « ${name} » ? Vous ne verrez plus ses commandes.`,
    leaveConfirm: 'Oui, quitter',
    thisMerchant: 'ce commerce',
  },
};

// The driver's side of the fleet link ("Comercios"), reached from Cuenta. Two lists:
//  - the merchants whose team this driver is on (accepted links) -- the ONLY orders they see;
//  - the invitations still pending, each with a code box: the merchant hands the driver a code
//    when adding them, and typing it here is what turns the invitation into membership.
export default function DriverMerchantsScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [loading, setLoading] = useState(true);
  const [merchants, setMerchants] = useState<DriverMerchant[]>([]);
  // One code draft per pending invitation, keyed by merchant, so typing in one box does not
  // bleed into the next.
  const [codes, setCodes] = useState<Record<string, string>>({});
  // Which row is mid-action (accept/decline/leave), so only its own button shows a spinner.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toLeave, setToLeave] = useState<DriverMerchant | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const res = await api.driverMerchants();
    if (res.success) setMerchants(res.data ?? []);
    else setNotice({ tone: 'error', message: res.message });
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]));

  const accepted = merchants.filter((m) => m.status === 'ACCEPTED');
  const pending = merchants.filter((m) => m.status === 'PENDING');

  const accept = async (m: DriverMerchant) => {
    const code = (codes[m.merchantCompanyId] ?? '').trim();
    if (!code) {
      setNotice({ tone: 'error', message: tx.codeRequired });
      return;
    }
    setBusyId(m.merchantCompanyId);
    const res = await api.acceptMerchantInvite(m.merchantCompanyId, code);
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    setCodes((prev) => { const next = { ...prev }; delete next[m.merchantCompanyId]; return next; });
    setNotice({ tone: 'success', message: res.message });
    await load();
  };

  const leave = async (m: DriverMerchant) => {
    setToLeave(null);
    setBusyId(m.merchantCompanyId);
    const res = await api.leaveMerchant(m.merchantCompanyId);
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    await load();
  };

  const merchantLine = (m: DriverMerchant) =>
    [m.phone, m.address].filter(Boolean).join(' · ');

  const nameOf = (m: DriverMerchant | null) => m?.name || tx.thisMerchant;

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
        <KeyboardAwareScrollView contentContainerStyle={styles.list}>
          <Text style={styles.intro}>{tx.intro}</Text>

          {/* Fleets joined. */}
          <Text style={styles.sectionTitle}>{tx.yourMerchants}</Text>
          {accepted.length === 0 ? (
            <Text style={styles.empty}>{tx.emptyMerchants}</Text>
          ) : accepted.map((m) => (
            <View key={m.merchantCompanyId} style={styles.card}>
              <View style={styles.row}>
                <FontAwesome5 name="store" size={15} color={t.text} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{m.name || tx.merchantFallback}</Text>
                  {merchantLine(m) ? <Text style={styles.hint}>{merchantLine(m)}</Text> : null}
                </View>
                {busyId === m.merchantCompanyId
                  ? <ActivityIndicator size="small" color={t.text} />
                  : (
                    <Pressable
                      style={[styles.pill, styles.pillDanger]}
                      onPress={() => setToLeave(m)}
                      disabled={busyId != null}
                      accessibilityRole="button"
                      accessibilityLabel={tx.leaveLabel(nameOf(m))}
                    >
                      <Text style={styles.pillDangerText}>{tx.leave}</Text>
                    </Pressable>
                  )}
              </View>
            </View>
          ))}

          {/* Invitations waiting for a code. */}
          <Text style={styles.sectionTitle}>{tx.pendingInvites}</Text>
          {pending.length === 0 ? (
            <Text style={styles.empty}>{tx.emptyPending}</Text>
          ) : (
            <>
              <Text style={styles.empty}>{tx.pendingHint}</Text>
              {pending.map((m) => (
                <View key={m.merchantCompanyId} style={styles.card}>
                  <View style={styles.row}>
                    <FontAwesome5 name="store" size={15} color={t.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{m.name || tx.merchantFallback}</Text>
                      {merchantLine(m) ? <Text style={styles.hint}>{merchantLine(m)}</Text> : null}
                    </View>
                    <Text style={styles.pendingBadge}>{tx.pending}</Text>
                  </View>
                  <View style={styles.codeRow}>
                    <TextInput
                      style={styles.input}
                      value={codes[m.merchantCompanyId] ?? ''}
                      onChangeText={(v) => setCodes((prev) => ({ ...prev, [m.merchantCompanyId]: v.toUpperCase() }))}
                      placeholder={tx.codePlaceholder}
                      placeholderTextColor={t.textFaint}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={6}
                      onSubmitEditing={() => accept(m)}
                      returnKeyType="done"
                    />
                    {busyId === m.merchantCompanyId
                      ? <ActivityIndicator size="small" color={t.text} />
                      : (
                        <>
                          <Pressable
                            style={[styles.pill, styles.pillAccent]}
                            onPress={() => accept(m)}
                            disabled={busyId != null}
                            accessibilityRole="button"
                            accessibilityLabel={tx.acceptLabel(nameOf(m))}
                          >
                            <Text style={styles.pillAccentText}>{tx.accept}</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.pill, styles.pillDanger]}
                            onPress={() => setToLeave(m)}
                            disabled={busyId != null}
                            accessibilityRole="button"
                            accessibilityLabel={tx.declineLabel(nameOf(m))}
                          >
                            <Text style={styles.pillDangerText}>{tx.decline}</Text>
                          </Pressable>
                        </>
                      )}
                  </View>
                </View>
              ))}
            </>
          )}
        </KeyboardAwareScrollView>
      )}

      {/* One dialog for both exits: declining an invitation and leaving a joined team are the
          same call, only the wording differs. */}
      <ConfirmDialog
        visible={toLeave != null}
        title={toLeave?.status === 'PENDING' ? tx.declineTitle : tx.leaveTitle}
        message={toLeave?.status === 'PENDING' ? tx.declineMessage(nameOf(toLeave)) : tx.leaveMessage(nameOf(toLeave))}
        confirmLabel={toLeave?.status === 'PENDING' ? tx.declineConfirm : tx.leaveConfirm}
        onConfirm={() => { if (toLeave) leave(toLeave); }}
        onCancel={() => setToLeave(null)}
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
  intro: { color: t.textMuted, fontSize: 13 },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, gap: 10 },
  hint: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.text, marginTop: 10 },
  empty: { color: t.textMuted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '700', color: t.text },
  pendingBadge: { color: t.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: t.text, letterSpacing: 2, fontWeight: '800',
  },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  pillDanger: { borderColor: t.danger, backgroundColor: t.card },
  pillDangerText: { color: t.danger, fontSize: 13, fontWeight: '800' },
  pillAccent: { borderColor: t.accent, backgroundColor: t.accent },
  pillAccentText: { color: t.onAccent, fontSize: 13, fontWeight: '800' },
});
