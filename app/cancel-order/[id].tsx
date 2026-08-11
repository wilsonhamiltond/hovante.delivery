import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';

// Why customers usually take an order back; "Otro" opens the door for anything else, and the
// notes box lets any choice be elaborated.
const REASONS = [
  'Cambié de opinión',
  'Lo pedí por error',
  'La espera es muy larga',
  'Quiero cambiar los productos',
  'Otro',
];

// The cancel screen: reached from the tracking screen's "Cancelar pedido", collects the reason
// (required) and optional notes, and only then cancels. The server re-checks that the merchant
// has not confirmed meanwhile, so a refusal here surfaces as the inline error rather than a
// silently half-cancelled order.
export default function CancelOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!id || !reason) return;
    setSubmitting(true);
    setError(null);
    const res = await api.cancelOrder(id, reason, notes.trim() || undefined);
    setSubmitting(false);
    if (!res.success) { setError(res.message); return; }
    // Back to the tracking screen, which now shows "Pedido cancelado" and the reason.
    router.replace(`/order/${id}`);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/order/${id}`));

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={back} />
        <Text style={styles.title}>Cancelar pedido</Text>
        <View style={{ width: BACK_BUTTON_WIDTH }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          Cuéntanos por qué cancelas. El pedido solo puede cancelarse mientras el comercio no lo
          haya confirmado.
        </Text>

        {REASONS.map((r) => (
          <Pressable
            key={r}
            style={[styles.reason, reason === r && styles.reasonActive]}
            onPress={() => setReason(r)}
            accessibilityRole="button"
          >
            <View style={[styles.radio, reason === r && styles.radioActive]}>
              {reason === r ? <View style={styles.radioDot} /> : null}
            </View>
            <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
          </Pressable>
        ))}

        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Cuéntanos más…"
          placeholderTextColor={t.textFaint}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.confirm, (!reason || submitting) && styles.disabled]}
          disabled={!reason || submitting}
          onPress={submit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Cancelar pedido</Text>}
        </Pressable>
        <Pressable onPress={back} disabled={submitting}>
          <Text style={styles.keep}>Volver sin cancelar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  scroll: { padding: 16, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  lead: { fontSize: 14, color: t.textMuted, lineHeight: 20, marginBottom: 4 },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 14,
  },
  reasonActive: { borderColor: '#fca5a5', backgroundColor: 'rgba(220,38,38,0.18)' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#fca5a5' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fca5a5' },
  reasonText: { color: t.textMuted, fontSize: 15, flex: 1 },
  reasonTextActive: { color: t.text, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: 8 },
  input: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, minHeight: 64, fontSize: 15, color: t.text, textAlignVertical: 'top' },
  error: { color: t.danger, fontSize: 14, textAlign: 'center', marginTop: 4 },
  confirm: { backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  keep: { color: t.textMuted, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
