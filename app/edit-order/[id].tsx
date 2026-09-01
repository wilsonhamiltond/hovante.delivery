import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { useStrings, type Locale } from '../../src/i18n';

const money = (n: number) => `RD$${n.toFixed(2)}`;

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
  }
> = {
  es: {
    title: 'Modificar pedido',
    lead: 'Cambia las cantidades o quita productos. Solo puede modificarse mientras el comercio no haya confirmado el pedido.',
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
  },
  en: {
    title: 'Modify order',
    lead: "Change quantities or remove products. The order can only be modified while the merchant hasn't confirmed it.",
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
  },
  fr: {
    title: 'Modifier la commande',
    lead: 'Changez les quantités ou retirez des produits. La commande ne peut être modifiée que tant que le commerce ne l’a pas confirmée.',
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
  },
};

// One editable order line: the snapshot the order carries, with the quantity now mutable. The
// price shown is the snapshotted one; the server re-prices from the live catalogue on save, so a
// price change between placing and editing shows up in the response, not here.
type EditLine = { itemId: string; name: string; unitPrice: number; quantity: number };

// The customer changing a still-PENDING order: quantities, removals, the note and the cash bill.
// Adding products is deliberately not here -- that is the cart's job, and an order wanting new
// products can be cancelled and placed again. The server refuses the save once the merchant has
// confirmed, so a window closing mid-edit is refused there rather than half-applied here.
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

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/order/${id}`));

  const setQty = (itemId: string, delta: number) => {
    setLines((prev) => prev
      .map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0));
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
