import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from './theme';

// A time-of-day field: an input-shaped control showing "9:00 a. m." that opens a picker sheet
// (the QueueTimeModal shape) instead of asking anyone to type "HH:MM" on a phone keyboard. The
// value in and out stays the API's 24h "HH:mm" string; only the display is 12-hour, which is how
// a Dominican shopkeeper says an opening hour out loud.
//
// Built here rather than on the platform's native picker so the same control renders on Android,
// iOS and the web build alike -- and stays inside Expo Go without a new dependency.

const MINUTE_PRESETS = [0, 15, 30, 45];

const parse = (v: string): { hour: number; minute: number } => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  const hour = m ? Math.min(23, Number(m[1])) : 9;
  const minute = m ? Math.min(59, Number(m[2])) : 0;
  return { hour, minute };
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatTime = (v: string): string => {
  const { hour, minute } = parse(v);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
};

export function TimeField({ value, title, onChange }: {
  /** The time as the API's "HH:mm" (24h). */
  value: string;
  /** Names what is being picked in the sheet ("Lunes · Abre"). */
  title: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The choice being made, committed only by "Listo" -- closing the sheet any other way keeps the
  // field as it was. Seeded from the value each time the sheet opens.
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const show = () => {
    const cur = parse(value);
    setHour(cur.hour);
    setMinute(cur.minute);
    setOpen(true);
  };

  const confirm = () => {
    onChange(`${pad(hour)}:${pad(minute)}`);
    setOpen(false);
  };

  const isPm = hour >= 12;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  // A minute that arrived off the preset grid (a "09:10" typed in the ERP) still has to be
  // representable, or opening the picker and pressing "Listo" would silently move the time.
  const minuteOptions = MINUTE_PRESETS.includes(minute)
    ? MINUTE_PRESETS
    : [...MINUTE_PRESETS, minute].sort((a, b) => a - b);

  return (
    <>
      <Pressable style={styles.field} onPress={show} accessibilityRole="button" accessibilityLabel={title}>
        <Text style={styles.fieldText}>{formatTime(value)}</Text>
        <Text style={styles.fieldIcon}>🕐</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>

            {/* a. m. / p. m. first: it halves the hour grid's meaning before an hour is tapped. */}
            <View style={styles.ampmRow}>
              {[{ label: 'a. m.', pm: false }, { label: 'p. m.', pm: true }].map(({ label, pm }) => {
                const on = isPm === pm;
                return (
                  <Pressable
                    key={label}
                    style={[styles.ampm, on && styles.chipOn]}
                    onPress={() => setHour((h) => (pm ? (h % 12) + 12 : h % 12))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Hora</Text>
            <View style={styles.chips}>
              {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                const on = h12 === h;
                return (
                  <Pressable
                    key={h}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setHour(((h % 12) + (isPm ? 12 : 0)))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{h}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Minutos</Text>
            <View style={styles.chips}>
              {minuteOptions.map((m) => {
                const on = minute === m;
                return (
                  <Pressable
                    key={m}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setMinute(m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>:{pad(m)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.primary} onPress={confirm} accessibilityRole="button">
              <Text style={styles.primaryText}>
                Listo · {`${h12}:${pad(minute)} ${isPm ? 'p. m.' : 'a. m.'}`}
              </Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  fieldText: { flex: 1, fontSize: 15, color: t.text, fontWeight: '700' },
  fieldIcon: { fontSize: 14 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 6 },
  ampmRow: { flexDirection: 'row', gap: 8 },
  ampm: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
    paddingVertical: 10, alignItems: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 52, borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
    paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center',
  },
  chipOn: { backgroundColor: t.accent, borderColor: t.accent },
  chipText: { color: t.text, fontSize: 14, fontWeight: '800' },
  chipTextOn: { color: t.onAccent },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { color: t.onAccent, fontSize: 15, fontWeight: '800' },
  cancel: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 10 },
});
