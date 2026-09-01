import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as api from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { TimeField } from '../src/TimeField';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

// Monday first, the way a Dominican week is read -- but each day keeps its .NET DayOfWeek number
// (0 = domingo), which is what the API stores. Display names live in the S map below.
const WEEK = [
  { day: 1 },
  { day: 2 },
  { day: 3 },
  { day: 4 },
  { day: 5 },
  { day: 6 },
  { day: 0 },
];

const S: Record<
  Locale,
  {
    dayNames: Record<number, string>;
    invalidTime: (day: string) => string;
    closeAfterOpen: (day: string) => string;
    saved: string;
    title: string;
    hint: string;
    closed: string;
    opens: string;
    closes: string;
    save: string;
  }
> = {
  es: {
    dayNames: {
      1: 'Lunes',
      2: 'Martes',
      3: 'Miércoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sábado',
      0: 'Domingo',
    },
    invalidTime: (day) => `${day}: elige una hora válida.`,
    closeAfterOpen: (day) => `${day}: la hora de cierre debe ser después de la de apertura.`,
    saved: 'Horario guardado.',
    title: 'Horario',
    hint: 'Marca los días que tu comercio abre y elige la hora de apertura y de cierre.',
    closed: 'Cerrado',
    opens: 'Abre',
    closes: 'Cierra',
    save: 'Guardar horario',
  },
  en: {
    dayNames: {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      0: 'Sunday',
    },
    invalidTime: (day) => `${day}: choose a valid time.`,
    closeAfterOpen: (day) => `${day}: the closing time must be after the opening time.`,
    saved: 'Hours saved.',
    title: 'Business hours',
    hint: 'Check the days your business is open and choose the opening and closing time.',
    closed: 'Closed',
    opens: 'Opens',
    closes: 'Closes',
    save: 'Save hours',
  },
  fr: {
    dayNames: {
      1: 'Lundi',
      2: 'Mardi',
      3: 'Mercredi',
      4: 'Jeudi',
      5: 'Vendredi',
      6: 'Samedi',
      0: 'Dimanche',
    },
    invalidTime: (day) => `${day} : choisissez une heure valide.`,
    closeAfterOpen: (day) => `${day} : l’heure de fermeture doit être après celle d’ouverture.`,
    saved: 'Horaires enregistrés.',
    title: 'Horaires',
    hint: 'Cochez les jours d’ouverture de votre commerce et choisissez l’heure d’ouverture et de fermeture.',
    closed: 'Fermé',
    opens: 'Ouvre',
    closes: 'Ferme',
    save: 'Enregistrer les horaires',
  },
};

// A sensible first fill for a day just switched on, so the merchant edits two times rather than
// typing both from nothing.
const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '18:00';

interface DayState { open: boolean; from: string; to: string }

// "9:00" and "09:00" both count; anything else is a typo worth naming. Returns minutes since
// midnight so the open/close comparison is one subtraction, or null when invalid.
const toMinutes = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

// The merchant's weekly opening hours, reached from "Mi cuenta". One row per day: switch it on and
// give the opening and closing hour. Saved as a whole week in one press -- a day switched off is
// simply not sent, which the API reads as closed.
export default function BusinessHoursScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [days, setDays] = useState<Record<number, DayState>>(() =>
    Object.fromEntries(WEEK.map((w) => [w.day, { open: false, from: DEFAULT_OPEN, to: DEFAULT_CLOSE }])));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  useEffect(() => {
    let alive = true;
    api.merchantBusinessHours().then((res) => {
      if (!alive) return;
      if (!res.success) { setError(res.message); return; }
      setDays((prev) => {
        const next = { ...prev };
        for (const h of res.data ?? []) {
          next[h.dayOfWeek] = { open: true, from: h.openTime, to: h.closeTime };
        }
        return next;
      });
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const setDay = (day: number, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const save = async () => {
    // Checked in display order, so the message points at the first day to fix.
    const hours: api.BusinessHour[] = [];
    for (const w of WEEK) {
      const d = days[w.day];
      if (!d.open) continue;
      const from = toMinutes(d.from);
      const to = toMinutes(d.to);
      if (from == null || to == null) {
        return setNotice({ tone: 'error', message: tx.invalidTime(tx.dayNames[w.day]) });
      }
      if (to <= from) {
        return setNotice({ tone: 'error', message: tx.closeAfterOpen(tx.dayNames[w.day]) });
      }
      hours.push({ dayOfWeek: w.day, openTime: d.from.trim(), closeTime: d.to.trim() });
    }

    setSaving(true);
    const res = await api.saveMerchantBusinessHours(hours);
    setSaving(false);
    setNotice(res.success
      ? { tone: 'success', message: res.message || tx.saved }
      : { tone: 'error', message: res.message });
  };

  // Leaving on success matches the edit-profile screen; an error stays put with everything typed.
  const dismiss = () => {
    const wasSuccess = notice?.tone === 'success';
    setNotice(null);
    if (wasSuccess) back();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={styles.title}>{tx.title}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        ) : (
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.hint}>
                {tx.hint}
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {WEEK.map((w) => {
                const d = days[w.day];
                return (
                  <View key={w.day} style={styles.dayCard}>
                    <Pressable style={styles.dayHead} onPress={() => setDay(w.day, { open: !d.open })} accessibilityRole="button">
                      <View style={[styles.checkbox, d.open && styles.checkboxOn]}>
                        {d.open ? <Text style={styles.checkboxTick}>✓</Text> : null}
                      </View>
                      <Text style={styles.dayName}>{tx.dayNames[w.day]}</Text>
                      <Text style={styles.dayState}>{d.open ? '' : tx.closed}</Text>
                    </Pressable>
                    {d.open ? (
                      <View style={styles.hoursRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>{tx.opens}</Text>
                          <TimeField
                            value={d.from}
                            title={`${tx.dayNames[w.day]} · ${tx.opens}`}
                            onChange={(v) => setDay(w.day, { from: v })}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>{tx.closes}</Text>
                          <TimeField
                            value={d.to}
                            title={`${tx.dayNames[w.day]} · ${tx.closes}`}
                            onChange={(v) => setDay(w.day, { to: v })}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={[styles.primary, saving && styles.disabled]} onPress={save} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={t.onAccent} />
                  : <Text style={styles.primaryText}>{tx.save}</Text>}
              </Pressable>
            </View>
          </View>
        )}

        <NoticeDialog notice={notice} onClose={dismiss} />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  hint: { color: t.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  error: { color: t.danger, fontSize: 14 },

  dayCard: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
  checkboxTick: { color: t.onAccent, fontWeight: '900', fontSize: 14 },
  dayName: { flex: 1, fontSize: 15, fontWeight: '800', color: t.text },
  dayState: { fontSize: 13, fontWeight: '700', color: t.textFaint },
  hoursRow: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: t.textMuted, marginBottom: 4 },

  footer: { paddingHorizontal: 16, paddingBottom: 8 },
  primary: {
    backgroundColor: t.accent, borderRadius: 14, minHeight: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
