import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<
  Locale,
  {
    title: (order: string) => string;
    orderFallback: string;
    lead: string;
    now: string;
    minutes: (m: number) => string;
    customLabel: string;
    customPlaceholder: string;
    confirmNow: string;
    confirmIn: (min: number) => string;
    confirm: string;
    cancel: string;
  }
> = {
  es: {
    title: (order) => `Confirmar ${order}`,
    orderFallback: 'pedido',
    lead: '¿En cuánto tiempo empezarán a preparar este pedido?',
    now: 'Ahora',
    minutes: (m) => `${m} min`,
    customLabel: 'Otro tiempo (minutos)',
    customPlaceholder: 'Ej: 45',
    confirmNow: 'Confirmar · empezamos ahora',
    confirmIn: (min) => `Confirmar · en ${min} min`,
    confirm: 'Confirmar',
    cancel: 'Cancelar',
  },
  en: {
    title: (order) => `Confirm ${order}`,
    orderFallback: 'order',
    lead: 'How soon will you start preparing this order?',
    now: 'Now',
    minutes: (m) => `${m} min`,
    customLabel: 'Another time (minutes)',
    customPlaceholder: 'E.g. 45',
    confirmNow: 'Confirm · starting now',
    confirmIn: (min) => `Confirm · in ${min} min`,
    confirm: 'Confirm',
    cancel: 'Cancel',
  },
};

// Asked when the merchant confirms an order: how long will it queue before the counter starts
// preparing it? Presets cover the answers a shopkeeper actually gives; the box takes the odd one
// out. Shared by the home queue and the order-detail screen so confirming feels the same on both.
//
// The modal collects the minutes and hands them to onConfirm -- the caller owns the API call and
// its error handling, which it already has for the other counter actions.

const PRESETS = [0, 5, 10, 15, 20, 30];

export function QueueTimeModal({ visible, orderNumber, busy, error, onConfirm, onClose }: {
  visible: boolean;
  // Named in the title so a counter with several new orders knows which one it is accepting.
  orderNumber: string | null;
  busy: boolean;
  // A failed confirm keeps the modal open (the choice is not lost) -- so its error must show HERE;
  // the list's own error line sits behind the scrim.
  error?: string | null;
  onConfirm: (queueMinutes: number) => void;
  onClose: () => void;
}) {
  const tx = useStrings(S);
  const [selected, setSelected] = useState<number | null>(null);
  // The free-text minutes, live only while no preset is selected. Kept as text: "25" mid-typing
  // passes through "2", and clamping while someone types fights them.
  const [custom, setCustom] = useState('');

  const customMinutes = custom.trim() === '' ? null : Number(custom.trim());
  const minutes = selected ?? customMinutes;
  // 24h mirrors the server's cap; a negative or unparseable box is simply not a time.
  const valid = minutes != null && Number.isInteger(minutes) && minutes >= 0 && minutes <= 24 * 60;

  const reset = () => { setSelected(null); setCustom(''); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={styles.scrim} onPress={() => { if (!busy) { reset(); onClose(); } }}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{tx.title(orderNumber ?? tx.orderFallback)}</Text>
          <Text style={styles.lead}>{tx.lead}</Text>

          <View style={styles.presets}>
            {PRESETS.map((m) => {
              const on = selected === m;
              return (
                <Pressable
                  key={m}
                  style={[styles.preset, on && styles.presetOn]}
                  onPress={() => { setSelected(on ? null : m); setCustom(''); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.presetText, on && styles.presetTextOn]}>
                    {m === 0 ? tx.now : tx.minutes(m)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{tx.customLabel}</Text>
          <TextInput
            style={styles.input}
            value={custom}
            onChangeText={(v) => { setCustom(v); setSelected(null); }}
            placeholder={tx.customPlaceholder}
            placeholderTextColor={t.textFaint}
            keyboardType="number-pad"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, (!valid || busy) && styles.disabled]}
            disabled={!valid || busy}
            onPress={() => onConfirm(minutes as number)}
          >
            {busy
              ? <ActivityIndicator color={t.onAccent} />
              : (
                <Text style={styles.primaryText}>
                  {minutes === 0 ? tx.confirmNow : valid ? tx.confirmIn(minutes as number) : tx.confirm}
                </Text>
              )}
          </Pressable>
          <Pressable onPress={() => { reset(); onClose(); }} disabled={busy}>
            <Text style={styles.cancel}>{tx.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  lead: { fontSize: 14, fontWeight: '600', color: t.textMuted, marginBottom: 4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  presetOn: { backgroundColor: t.accent, borderColor: t.accent },
  presetText: { color: t.text, fontSize: 14, fontWeight: '800' },
  presetTextOn: { color: t.onAccent },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 6 },
  input: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text,
  },
  primary: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancel: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 10 },
  error: { color: t.danger, fontSize: 13, fontWeight: '600', marginTop: 4 },
  disabled: { opacity: 0.6 },
});
