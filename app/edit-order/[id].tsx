import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { emojiFor } from '../../src/categoryEmoji';
import { useStrings, type Locale } from '../../src/i18n';

const money = (n: number) => `RD$${n.toFixed(2)}`;

// How many catalogue products each page of the add section fetches. Small on purpose: the section
// lives inside the edit form, so it grows five rows at a time as the user scrolls.
const CATALOG_PAGE = 5;

const S: Record<
  Locale,
  {
    title: string;
    lead: string;
    notFound: string;
    windowClosed: string;
    notesLabel: string;
    notesPlaceholder: string;
    payWithLabel: string;
    payWithPlaceholder: string;
    payWithShort: string;
    subtotal: string;
    shipping: string;
    total: string;
    save: string;
    keep: string;
    lastLine: string;
    addLabel: string;
    addSearchPlaceholder: string;
    addBtn: string;
    addNoResults: string;
  }
> = {
  es: {
    title: 'Modificar pedido',
    lead: 'Cambia cantidades, quita o agrega productos. Solo puede modificarse mientras el comercio no haya confirmado el pedido.',
    notFound: 'Pedido no encontrado.',
    windowClosed: 'El comercio ya tomó tu pedido y no puede modificarse.',
    notesLabel: 'Nota para el comercio (opcional)',
    notesPlaceholder: 'Ej. sin salsa picante…',
    payWithLabel: 'Pagarás con (opcional)',
    payWithPlaceholder: 'Ej. 1000',
    payWithShort: 'El monto debe cubrir el total del pedido.',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    total: 'Total',
    save: 'Guardar cambios',
    keep: 'Volver sin cambiar',
    lastLine: 'El pedido debe tener al menos un producto. Si ya no lo quieres, cancélalo.',
    addLabel: 'Agregar productos',
    addSearchPlaceholder: 'Buscar en el comercio…',
    addBtn: 'Agregar',
    addNoResults: 'No se encontraron productos.',
  },
  en: {
    title: 'Modify order',
    lead: "Change quantities, remove or add products. The order can only be modified while the merchant hasn't confirmed it.",
    notFound: 'Order not found.',
    windowClosed: 'The merchant already took your order and it can no longer be modified.',
    notesLabel: 'Note for the merchant (optional)',
    notesPlaceholder: 'E.g. no hot sauce…',
    payWithLabel: "You'll pay with (optional)",
    payWithPlaceholder: 'E.g. 1000',
    payWithShort: 'The amount must cover the order total.',
    subtotal: 'Subtotal',
    shipping: 'Delivery fee',
    total: 'Total',
    save: 'Save changes',
    keep: 'Go back without changing',
    lastLine: "The order needs at least one product. If you no longer want it, cancel it instead.",
    addLabel: 'Add products',
    addSearchPlaceholder: 'Search this merchant…',
    addBtn: 'Add',
    addNoResults: 'No products found.',
  },
  fr: {
    title: 'Modifier la commande',
    lead: 'Changez les quantités, retirez ou ajoutez des produits. La commande ne peut être modifiée que tant que le commerce ne l’a pas confirmée.',
    notFound: 'Commande introuvable.',
    windowClosed: 'Le commerce a déjà pris votre commande et elle ne peut plus être modifiée.',
    notesLabel: 'Note pour le commerce (facultatif)',
    notesPlaceholder: 'Ex. sans sauce piquante…',
    payWithLabel: 'Vous paierez avec (facultatif)',
    payWithPlaceholder: 'Ex. 1000',
    payWithShort: 'Le montant doit couvrir le total de la commande.',
    subtotal: 'Sous-total',
    shipping: 'Livraison',
    total: 'Total',
    save: 'Enregistrer',
    keep: 'Revenir sans changer',
    lastLine: 'La commande doit contenir au moins un produit. Si vous n’en voulez plus, annulez-la.',
    addLabel: 'Ajouter des produits',
    addSearchPlaceholder: 'Rechercher chez ce commerce…',
    addBtn: 'Ajouter',
    addNoResults: 'Aucun produit trouvé.',
  },
};

// One editable order line: the snapshot the order carries, with the quantity now mutable. The
// price shown is the snapshotted one; the server re-prices from the live catalogue on save, so a
// price change between placing and editing shows up in the response, not here.
type EditLine = { itemId: string; name: string; unitPrice: number; quantity: number };

// The customer changing a still-PENDING order: quantities, removals, additions from the same
// merchant's catalogue, the note and the cash bill. The server refuses the save once the merchant
// has confirmed, so a window closing mid-edit is refused there rather than half-applied here --
// and it refuses products of any other merchant, so the catalogue below is scoped to the order's.
export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tx = useStrings(S);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<api.Order | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [notes, setNotes] = useState('');
  const [payWith, setPayWith] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The add-products section: the order's merchant's catalogue, filtered by the search box and
  // paged CATALOG_PAGE at a time as the outer scroll nears its end. Collapsed until asked for --
  // most edits are a quantity change, not a new craving.
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<api.Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  // Whether the last page came back full -- a short page means the catalogue is exhausted.
  const [catalogHasMore, setCatalogHasMore] = useState(true);
  // Guards the scroll handler: a page already in flight must not be asked for twice.
  const catalogBusy = useRef(false);

  // Loaded once per focus, and the form seeded from it once -- a poll overwriting quantities
  // mid-edit would fight the user's fingers.
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const res = await api.orderTracking(String(id));
      if (!alive) return;
      if (res.success && res.data) {
        const o = res.data.order;
        setOrder(o);
        setLines(o.items.map((li) => ({ itemId: li.itemId, name: li.name, unitPrice: li.unitPrice, quantity: li.quantity })));
        setNotes(o.notes ?? '');
        setPayWith(o.payWithAmount != null ? String(o.payWithAmount) : '');
      } else {
        setError(res.message);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]));

  // One page of the merchant's catalogue. skip tells it where to continue; 0 starts over (a new
  // search, or the section just opened). A full page leaves hasMore standing, a short one ends it.
  const merchantCompanyId = order?.merchantCompanyId;
  const loadCatalog = useCallback(async (skip: number) => {
    if (!merchantCompanyId || catalogBusy.current) return;
    catalogBusy.current = true;
    setCatalogLoading(true);
    const res = await api.products({
      companyId: merchantCompanyId,
      search: search.trim() || undefined,
      skip,
      take: CATALOG_PAGE,
    });
    const page = res.success ? (res.data ?? []) : [];
    setCatalog((prev) => (skip === 0 ? page : [...prev, ...page]));
    setCatalogHasMore(page.length === CATALOG_PAGE);
    setCatalogLoading(false);
    catalogBusy.current = false;
  }, [merchantCompanyId, search]);

  // First page, re-fetched as the search text settles. Debounced a beat so a fast typist costs one
  // request, not one per keystroke.
  useEffect(() => {
    if (!adding || !merchantCompanyId) return;
    const timer = setTimeout(() => { loadCatalog(0); }, 300);
    return () => clearTimeout(timer);
  }, [adding, merchantCompanyId, search, loadCatalog]);

  // The infinite scroll: the catalogue scrolls inside its own capped box, so nearing THAT box's
  // end is what asks for the next page -- the form around it never grows with the list.
  const onCatalogScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (catalogLoading || !catalogHasMore) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 100) {
      loadCatalog(catalog.length);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/order/${id}`));

  const setQty = (itemId: string, delta: number) => {
    setLines((prev) => prev
      .map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0));
  };

  // Adding a product already on the order bumps its quantity -- one line per product, like the cart.
  const addProduct = (p: api.Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === p.id);
      if (existing) return prev.map((l) => (l.itemId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { itemId: p.id, name: p.name, unitPrice: p.price, quantity: 1 }];
    });
  };

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const fee = order?.deliveryFee ?? 0;
  const grandTotal = subtotal + fee;

  const save = async () => {
    if (!order || lines.length === 0 || submitting) return;
    setError(null);
    // The same rule the server applies, said before the round trip: a bill below the total
    // cannot make change. Blank means "keep what it was / exact payment".
    const payWithValue = payWith.trim().length > 0 ? Number(payWith.trim()) : undefined;
    if (payWithValue != null && (!Number.isFinite(payWithValue) || payWithValue < grandTotal)) {
      setError(tx.payWithShort);
      return;
    }
    setSubmitting(true);
    const res = await api.updateOrder(order.id, {
      items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      notes: notes.trim() || undefined,
      cashPayWith: payWithValue,
    });
    setSubmitting(false);
    if (!res.success) { setError(res.message); return; }
    back();
  };

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'bottom']}>
          <ActivityIndicator color={t.accent} size="large" />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const editable = order?.status === 'PENDING';

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={styles.title}>{tx.title}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {!order ? (
            <Text style={styles.error}>{error ?? tx.notFound}</Text>
          ) : !editable ? (
            // The merchant confirmed (or the order finished) while the screen was reached: say
            // so instead of offering steppers the server would refuse.
            <Text style={styles.lead}>{tx.windowClosed}</Text>
          ) : (
            <>
              <Text style={styles.lead}>{tx.lead}</Text>

              {lines.map((l) => (
                <View key={l.itemId} style={styles.line}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName}>{l.name}</Text>
                    <Text style={styles.lineUnit}>{money(l.unitPrice)}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} onPress={() => setQty(l.itemId, -1)} accessibilityRole="button">
                      <Text style={styles.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qty}>{l.quantity}</Text>
                    <Pressable style={styles.stepBtn} onPress={() => setQty(l.itemId, +1)} accessibilityRole="button">
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.linePrice}>{money(l.unitPrice * l.quantity)}</Text>
                </View>
              ))}
              {lines.length === 0 ? <Text style={styles.lastLine}>{tx.lastLine}</Text> : null}

              {/* Add products, from this order's merchant alone (the server refuses any other).
                  Collapsed behind a button; expanding it shows the searchable catalogue. */}
              {!adding ? (
                <Pressable style={styles.addToggle} onPress={() => setAdding(true)} accessibilityRole="button">
                  <Text style={styles.addToggleText}>＋ {tx.addLabel}</Text>
                </Pressable>
              ) : (
                <>
                  <Text style={styles.label}>{tx.addLabel}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={tx.addSearchPlaceholder}
                    placeholderTextColor={t.textFaint}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {/* The results scroll inside their own capped box, so a long catalogue never
                      stretches the form -- nestedScrollEnabled lets Android hand it the gesture. */}
                  <ScrollView
                    style={styles.catalogBox}
                    nestedScrollEnabled
                    onScroll={onCatalogScroll}
                    scrollEventThrottle={100}
                  >
                    {catalog.map((p) => (
                      <View key={p.id} style={[styles.line, styles.catalogLine]}>
                        {/* The item's own photo when the merchant set one; the category icon stands
                            in for the ones that have none -- same convention as the cart. */}
                        <View style={styles.thumb}>
                          {p.imageUrl ? (
                            <Image source={{ uri: p.imageUrl }} style={styles.thumbImage} resizeMode="contain" />
                          ) : (
                            <Text style={styles.thumbEmoji}>{emojiFor(p.categories?.[0] ?? p.companyName)}</Text>
                          )}
                        </View>
                        <View style={styles.lineInfo}>
                          <Text style={styles.lineName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.lineUnit}>{money(p.price)}</Text>
                        </View>
                        <Pressable style={styles.addBtn} onPress={() => addProduct(p)} accessibilityRole="button">
                          <Text style={styles.addBtnText}>＋ {tx.addBtn}</Text>
                        </Pressable>
                      </View>
                    ))}
                    {/* The page spinner doubles as the loading state for a fresh search; "nothing
                        found" only once a finished, empty fetch says so. */}
                    {catalogLoading ? (
                      <ActivityIndicator color={t.accent} style={styles.catalogSpinner} />
                    ) : catalog.length === 0 ? (
                      <Text style={styles.lastLine}>{tx.addNoResults}</Text>
                    ) : null}
                  </ScrollView>
                </>
              )}

              <Text style={styles.label}>{tx.notesLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={tx.notesPlaceholder}
                placeholderTextColor={t.textFaint}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <Text style={styles.label}>{tx.payWithLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={tx.payWithPlaceholder}
                placeholderTextColor={t.textFaint}
                value={payWith}
                onChangeText={setPayWith}
                keyboardType="numeric"
              />

              <View style={styles.totals}>
                <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.subtotal}</Text><Text style={styles.subValue}>{money(subtotal)}</Text></View>
                {fee > 0 ? (
                  <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.shipping}</Text><Text style={styles.subValue}>{money(fee)}</Text></View>
                ) : null}
                <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.total}</Text><Text style={styles.totalValue}>{money(grandTotal)}</Text></View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.confirm, (lines.length === 0 || submitting) && styles.disabled]}
                disabled={lines.length === 0 || submitting}
                onPress={save}
              >
                {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.confirmText}>{tx.save}</Text>}
              </Pressable>
              <Pressable onPress={back} disabled={submitting}>
                <Text style={styles.keep}>{tx.keep}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  scroll: { padding: 16, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  lead: { fontSize: 14, color: t.textMuted, lineHeight: 20, marginBottom: 4 },

  line: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: '700', color: t.text },
  lineUnit: { fontSize: 12, color: t.textFaint, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border,
  },
  stepBtnText: { color: t.text, fontSize: 18, fontWeight: '800', lineHeight: 20 },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: '800', color: t.text },
  linePrice: { minWidth: 72, textAlign: 'right', fontSize: 14, fontWeight: '800', color: t.text },
  lastLine: { color: t.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 8 },

  addToggle: {
    borderWidth: 1, borderColor: t.border, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', backgroundColor: 'transparent',
  },
  addToggleText: { color: t.text, fontSize: 15, fontWeight: '800' },
  addBtn: {
    backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: t.onAccent, fontSize: 13, fontWeight: '800' },
  catalogSpinner: { paddingVertical: 12 },
  // The capped results box: about two and a half rows tall, so the next row peeks below the fold
  // and the box reads as scrollable without eating the form.
  catalogBox: { maxHeight: 180 },
  // Inside its own ScrollView the outer gap does not reach the rows, so they space themselves.
  catalogLine: { marginBottom: 8 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: t.cardStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 22 },

  label: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: 8 },
  input: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, fontSize: 15, color: t.text, textAlignVertical: 'top' },

  totals: { marginTop: 10, gap: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  subValue: { fontSize: 14, fontWeight: '700', color: t.text },
  totalValue: { fontSize: 18, fontWeight: '900', color: t.text },

  error: { color: t.danger, fontSize: 14, textAlign: 'center', marginTop: 4 },
  confirm: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  confirmText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  keep: { color: t.textMuted, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
