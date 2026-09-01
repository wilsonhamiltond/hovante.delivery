import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from '../src/api';
import type { AddressHistory } from '../src/api';
import { useSessionLocation } from '../src/sessionLocation';
import { GradientBackground, t } from '../src/theme';
import { BackButton } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { ConfirmDialog } from '../src/ConfirmDialog';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    title: string;
    addA11y: string;
    add: string;
    savedTitle: string;
    savedHint: string;
    pastTitle: string;
    pastHint: string;
    empty: string;
    principal: string;
    usageMeta: (times: number, date: string) => string;
    savedFallback: string;
    deleteLabel: string;
    deleteA11y: (address: string) => string;
    makePrimaryLabel: string;
    makePrimaryA11y: (address: string) => string;
    editLabel: string;
    editA11y: (address: string) => string;
    confirmTitle: string;
    confirmMessage: (address: string) => string;
    confirmLabel: string;
  }
> = {
  es: {
    title: 'Direcciones',
    addA11y: 'Agregar dirección',
    add: 'Agregar',
    savedTitle: 'Tus direcciones',
    savedHint: 'Guardadas en tu cuenta',
    pastTitle: 'De pedidos anteriores',
    pastHint: 'Usadas para pedir, sin guardar',
    empty: 'Aún no tienes direcciones. Las que uses para pedir aparecerán aquí.',
    principal: 'Principal',
    usageMeta: (times, date) => `${times === 1 ? 'Usada 1 vez' : `Usada ${times} veces`} · Último pedido ${date}`,
    savedFallback: 'Guardada',
    deleteLabel: 'Eliminar',
    deleteA11y: (address) => `Eliminar ${address}`,
    makePrimaryLabel: 'Hacer principal',
    makePrimaryA11y: (address) => `Hacer principal ${address}`,
    editLabel: 'Editar',
    editA11y: (address) => `Editar ${address}`,
    confirmTitle: 'Eliminar dirección',
    confirmMessage: (address) => `¿Eliminar "${address}"?`,
    confirmLabel: 'Sí, eliminar',
  },
  en: {
    title: 'Addresses',
    addA11y: 'Add address',
    add: 'Add',
    savedTitle: 'Your addresses',
    savedHint: 'Saved to your account',
    pastTitle: 'From past orders',
    pastHint: 'Used to order, not saved',
    empty: "You don't have any addresses yet. The ones you order with will appear here.",
    principal: 'Primary',
    usageMeta: (times, date) => `${times === 1 ? 'Used 1 time' : `Used ${times} times`} · Last order ${date}`,
    savedFallback: 'Saved',
    deleteLabel: 'Delete',
    deleteA11y: (address) => `Delete ${address}`,
    makePrimaryLabel: 'Make primary',
    makePrimaryA11y: (address) => `Make ${address} primary`,
    editLabel: 'Edit',
    editA11y: (address) => `Edit ${address}`,
    confirmTitle: 'Delete address',
    confirmMessage: (address) => `Delete "${address}"?`,
    confirmLabel: 'Yes, delete',
  },
  fr: {
    title: 'Adresses',
    addA11y: 'Ajouter une adresse',
    add: 'Ajouter',
    savedTitle: 'Vos adresses',
    savedHint: 'Enregistrées dans votre compte',
    pastTitle: 'De commandes précédentes',
    pastHint: 'Utilisées pour commander, non enregistrées',
    empty: 'Vous n’avez pas encore d’adresses. Celles que vous utilisez pour commander apparaîtront ici.',
    principal: 'Principale',
    usageMeta: (times, date) => `${times === 1 ? 'Utilisée 1 fois' : `Utilisée ${times} fois`} · Dernière commande ${date}`,
    savedFallback: 'Enregistrée',
    deleteLabel: 'Supprimer',
    deleteA11y: (address) => `Supprimer ${address}`,
    makePrimaryLabel: 'Définir comme principale',
    makePrimaryA11y: (address) => `Définir ${address} comme principale`,
    editLabel: 'Modifier',
    editA11y: (address) => `Modifier ${address}`,
    confirmTitle: 'Supprimer l’adresse',
    confirmMessage: (address) => `Supprimer « ${address} » ?`,
    confirmLabel: 'Oui, supprimer',
  },
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// The client's addresses, in two groups: the address book they own (the default one at the top, set
// from the sign-up location step) and, separately, addresses seen only on past orders. Reachable
// from the account menu's "Direcciones".
export default function AddressesScreen() {
  const router = useRouter();
  const session = useSessionLocation();
  const tx = useStrings(S);
  const [items, setItems] = useState<AddressHistory[]>([]);
  const [loading, setLoading] = useState(true);
  // Which row is mid-action, so only its own button shows a spinner.
  const [busyId, setBusyId] = useState<string | null>(null);
  // The address whose delete is awaiting its "¿seguro?" answer in the popup. A ConfirmDialog
  // rather than Alert: Alert's buttons do not render on web, so an Alert-based confirm made the
  // Eliminar button do nothing there.
  const [pendingDelete, setPendingDelete] = useState<AddressHistory | null>(null);
  // API failures land in the themed dialog the sign-up wizard uses -- Alert has the same web
  // problem for messages as for confirms.
  const [notice, setNotice] = useState<Notice | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.myAddresses().then((res) => {
      if (active && res.success) setItems(res.data ?? []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  // Promote a saved address to the account's default. Only saved rows can be promoted: the list
  // also carries addresses seen on past orders, which exist as text on an order and have no id to
  // point at.
  const makePrimary = async (item: AddressHistory) => {
    if (!item.id || item.isDefault) return;
    setBusyId(item.id);
    const res = await api.setDefaultAddress(item.id);
    if (!res.success) {
      setBusyId(null);
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    // Refetched rather than flipping the flag locally: the server also reorders the list so the
    // default sits on top, and guessing that ordering here would drift from it.
    const list = await api.myAddresses();
    if (list.success) setItems(list.data ?? []);
    setBusyId(null);
    // Naming a new default is an explicit "deliver here", so it retires a session pin the same way
    // choosing an address from the home dropdown does.
    session.clear();
  };

  // Open the shared address form on this row. The row's own values ride along so the form opens
  // filled -- every field it edits is already on screen here.
  const edit = (item: AddressHistory) => {
    if (!item.id) return;
    router.push({
      pathname: '/address-new',
      params: {
        id: item.id,
        label: item.label ?? '',
        address: item.address,
        latitude: item.latitude != null ? String(item.latitude) : '',
        longitude: item.longitude != null ? String(item.longitude) : '',
      },
    });
  };

  // Rows are keyed by id when saved and by their text when order-derived (those have no id) --
  // the same disambiguation the list's keyExtractor makes.
  const keyOf = (item: AddressHistory) => item.id ?? item.address;

  const remove = async (item: AddressHistory) => {
    setPendingDelete(null);
    setBusyId(keyOf(item));
    // A saved address is deleted by id; a past-order one has no id, so it is hidden by its text.
    const res = item.id
      ? await api.deleteMyAddress(item.id)
      : await api.hideMyAddress(item.address);
    if (!res.success) {
      setBusyId(null);
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    // Refetched rather than filtered locally: removing the default one promotes another on the
    // server, and that new badge has to come from somewhere.
    const list = await api.myAddresses();
    if (list.success) setItems(list.data ?? []);
    setBusyId(null);
    // The session pin may have pointed at the address that just went away.
    session.clear();
  };

  // Two lists, not one. They are different things wearing the same card: the first is the address
  // book the customer owns and can edit, the second is text snapshotted onto past orders. Merged,
  // the rows without buttons read as saved addresses whose actions failed to render -- and there
  // was no way to tell which of them the account would actually deliver to.
  const sections = useMemo(() => [
    { key: 'saved', title: tx.savedTitle, hint: tx.savedHint, data: items.filter((a) => a.isSaved) },
    { key: 'past', title: tx.pastTitle, hint: tx.pastHint, data: items.filter((a) => !a.isSaved) },
  ].filter((s) => s.data.length > 0), [items, tx]);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {/* Reached from Cuenta > Direcciones rather than a tab, so it goes back like every other
            pushed screen. The replace fallback covers a deep link that arrives with no stack. */}
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
        <Text style={styles.title}>{tx.title}</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push('/address-new')}
          accessibilityRole="button"
          accessibilityLabel={tx.addA11y}
        >
          <FontAwesome5 name="plus" size={12} color={t.onAccent} />
          <Text style={styles.addBtnText}>{tx.add}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <SectionList
          sections={sections}
          // A saved address and an order-derived one can carry the same text, so the id joins the
          // key -- without it the two would collide and React would drop one of the rows.
          keyExtractor={(a) => `${a.id ?? 'past'}|${a.address}`}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, section.key === sections[0].key && styles.sectionHeaderFirst]}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionHint}>{section.hint}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{tx.empty}</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.addressRow}>
                  <Text style={[styles.address, { flex: 1 }]}>{item.address}</Text>
                  {item.isDefault ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>{tx.principal}</Text></View>
                  ) : null}
                </View>
                {/* A saved address that has never been ordered to has no usage line to show. */}
                <Text style={styles.meta}>
                  {item.lastUsedAt
                    ? tx.usageMeta(item.timesUsed, fmtDate(item.lastUsedAt))
                    : item.label ?? tx.savedFallback}
                </Text>

                {/* A saved address can be promoted, edited and deleted. A past-order one is text
                    on old orders with no row to edit or point the default at -- but it can still
                    be removed from this list, so Eliminar is the one action it gets. */}
                <View style={styles.actions}>
                  {busyId === keyOf(item) ? (
                    <ActivityIndicator size="small" color={t.text} style={styles.actionsSpinner} />
                  ) : !item.id ? (
                    <Pressable
                      style={[styles.actionBtn, styles.deleteBtn, busyId != null && styles.actionBtnBusy]}
                      onPress={() => setPendingDelete(item)}
                      disabled={busyId != null}
                      accessibilityRole="button"
                      accessibilityLabel={tx.deleteA11y(item.address)}
                    >
                      <FontAwesome5 name="trash" size={11} color={t.danger} />
                      <Text style={[styles.actionBtnText, styles.deleteBtnText]}>{tx.deleteLabel}</Text>
                    </Pressable>
                  ) : (
                    <>
                        {!item.isDefault ? (
                          <Pressable
                            style={[styles.actionBtn, busyId != null && styles.actionBtnBusy]}
                            onPress={() => makePrimary(item)}
                            disabled={busyId != null}
                            accessibilityRole="button"
                            accessibilityLabel={tx.makePrimaryA11y(item.address)}
                          >
                            <FontAwesome5 name="star" size={11} color={t.text} />
                            <Text style={styles.actionBtnText}>{tx.makePrimaryLabel}</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={[styles.actionBtn, busyId != null && styles.actionBtnBusy]}
                          onPress={() => edit(item)}
                          disabled={busyId != null}
                          accessibilityRole="button"
                          accessibilityLabel={tx.editA11y(item.address)}
                        >
                          <FontAwesome5 name="pen" size={11} color={t.text} />
                          <Text style={styles.actionBtnText}>{tx.editLabel}</Text>
                        </Pressable>
                        {/* The principal address cannot be deleted from here: it is the one every
                            checkout preselects, so removing it would leave the account without a
                            delivery address until the server picked a replacement. Make another
                            one principal first, and the button appears on this one. */}
                        {!item.isDefault ? (
                          <Pressable
                            style={[styles.actionBtn, styles.deleteBtn, busyId != null && styles.actionBtnBusy]}
                            onPress={() => setPendingDelete(item)}
                            disabled={busyId != null}
                            accessibilityRole="button"
                            accessibilityLabel={tx.deleteA11y(item.address)}
                          >
                            <FontAwesome5 name="trash" size={11} color={t.danger} />
                            <Text style={[styles.actionBtnText, styles.deleteBtnText]}>{tx.deleteLabel}</Text>
                          </Pressable>
                        ) : null}
                      </>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Deleting is asked about first: the address book is not something the customer can
          restore from the app. */}
      <ConfirmDialog
        visible={pendingDelete != null}
        title={tx.confirmTitle}
        message={tx.confirmMessage(pendingDelete?.address ?? '')}
        confirmLabel={tx.confirmLabel}
        onConfirm={() => { if (pendingDelete) remove(pendingDelete); }}
        onCancel={() => setPendingDelete(null)}
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
  list: { padding: 16, gap: 10, paddingBottom: 24 },
  // Sits above its group with air over it, so the break between the two lists is obvious without a
  // divider. The first one loses that top margin -- the screen header is already right above it.
  sectionHeader: { marginTop: 14, marginBottom: 2 },
  sectionHeaderFirst: { marginTop: 0 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.text },
  sectionHint: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 18 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { fontSize: 15, fontWeight: '700', color: t.text },
  badge: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: t.onAccent, fontSize: 11, fontWeight: '800' },
  // The one filled control on the screen, since adding is what someone comes here to do.
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: t.accent,
  },
  addBtnText: { color: t.onAccent, fontSize: 13, fontWeight: '800' },
  // Wraps, because three pills do not fit on one line on a narrow phone.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionsSpinner: { marginTop: 10, alignSelf: 'flex-start' },
  // Outlined rather than filled: the filled accent belongs to the "Principal" badge and the Agregar
  // button, and these sit inches from both -- a solid block would read as a badge, not an action.
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    minHeight: 30, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.cardStrong,
  },
  // While any row is working, the others read as unavailable rather than merely inert.
  actionBtnBusy: { opacity: 0.6 },
  actionBtnText: { color: t.text, fontSize: 12, fontWeight: '800' },
  // Only the destructive one is coloured, so it stands out among the three.
  deleteBtn: { borderColor: t.danger },
  deleteBtnText: { color: t.danger },
  meta: { fontSize: 13, color: t.textMuted, marginTop: 4 },
});
