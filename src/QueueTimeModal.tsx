import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from './theme';

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
          <Text style={styles.title}>Confirmar {orderNumber ?? 'pedido'}</Text>
          <Text style={styles.lead}>¿En cuánto tiempo empezarán a preparar este pedido?</Text>

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
                    {m === 0 ? 'Ahora' : `${m} min`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Otro tiempo (minutos)</Text>
          <TextInput
            style={styles.input}
            value={custom}
            onChangeText={(v) => { setCustom(v); setSelected(null); }}
            placeholder="Ej: 45"
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
                  {minutes === 0 ? 'Confirmar · empezamos ahora' : valid ? `Confirmar · en ${minutes} min` : 'Confirmar'}
                </Text>
              )}
          </Pressable>
          <Pressable onPress={() => { reset(); onClose(); }} disabled={busy}>
            <Text style={styles.cancel}>Cancelar</Text>
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
