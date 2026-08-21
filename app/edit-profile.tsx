import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from '../src/api';
import { isCompletePhone, parsePhone, splitDisplayName, toE164 } from '../src/profileForm';
import { PhoneInput } from '../src/PhoneInput';
import { DEFAULT_COUNTRY } from '../src/countries';
import type { CountryCode } from 'libphonenumber-js';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { GradientBackground, t } from '../src/theme';

// Edit the account's own details, reached from "Mi cuenta".
//
// Name and phone only. The email is shown but not editable: it is what the account is identified by
// -- sign-in, the sign-up verification code and every social provider link all resolve against it --
// so changing it here would quietly break the ways back into the account. The address is not here
// either; it has its own screen, and editing a surname must not disturb where orders go.
//
// A merchant gets one business row too: "Cerrado hoy", an exceptional one-day closure with an
// optional note. It saves with the same button as the rest of the form, and the flag expires with
// the Dominican day on the server -- nobody has to come back tomorrow to uncheck it.
export default function EditProfileScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  // One field for both halves, matching the sign-up wizard: people write their full name in one go.
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // "Cerrado hoy" (merchants only). `closure` is what the server last confirmed -- and doubles as
  // the "loaded" flag, so the section cannot render unchecked and then flip on its own under a tap.
  const [isMerchant, setIsMerchant] = useState(false);
  const [closure, setClosure] = useState<api.MerchantClosure | null>(null);
  const [closedToday, setClosedToday] = useState(false);
  const [closureNote, setClosureNote] = useState('');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  useEffect(() => {
    let active = true;
    api.me().then((res) => {
      if (!active || !res.success || !res.data) return;
      const me = res.data;
      setEmail(me.email ?? '');
      setFullName([me.name, me.lastName].map((p) => p?.trim()).filter(Boolean).join(' '));
      // A number saved before the country picker existed is a bare Dominican one; parsePhone reads
      // both that and E.164 back onto the right flag.
      const parsed = parsePhone(me.phone ?? '');
      setPhone(parsed.national);
      setPhoneCountry(parsed.country);
      if (me.isMerchant) {
        setIsMerchant(true);
        api.merchantClosure().then((cr) => {
          if (!active || !cr.success || !cr.data) return;
          setClosure(cr.data);
          setClosedToday(cr.data.closedToday);
          setClosureNote(cr.data.note ?? '');
        });
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    // Checked in the order the fields appear, so the message points at the first thing to fix.
    if (!fullName.trim()) return setNotice({ tone: 'error', message: 'Escribe tu nombre y apellido.' });
    const person = splitDisplayName(fullName);
    if (!person.lastName) return setNotice({ tone: 'error', message: 'Escribe tu nombre y tu apellido.' });
    if (!isCompletePhone(phone, phoneCountry)) {
      return setNotice({ tone: 'error', message: 'Escribe un número de teléfono válido para el país seleccionado.' });
    }

    setSubmitting(true);
    const res = await api.updateProfile({ name: person.name, lastName: person.lastName, phone: toE164(phone, phoneCountry) });
    if (!res.success) {
      setSubmitting(false);
      return setNotice({ tone: 'error', message: res.message });
    }

    // The merchant's "Cerrado hoy", only when it actually changed. A failure here does not undo
    // the personal data above -- that saved -- so the error says exactly which half did not.
    const closureDirty = closure != null
      && (closedToday !== closure.closedToday
        || (closedToday && closureNote.trim() !== (closure.note ?? '')));
    if (closureDirty) {
      const cr = await api.saveMerchantClosure({
        closedToday,
        note: closedToday && closureNote.trim() ? closureNote.trim() : undefined,
      });
      setSubmitting(false);
      if (!cr.success || !cr.data) {
        return setNotice({ tone: 'error', message: `Tus datos se guardaron, pero el cierre de hoy no: ${cr.message}` });
      }
      setClosure(cr.data);
      // The closure endpoint's message already says which way it went ("queda cerrado por hoy").
      return setNotice({ tone: 'success', message: `Tus datos fueron actualizados. ${cr.message}` });
    }

    setSubmitting(false);
    setNotice({ tone: 'success', message: 'Tus datos fueron actualizados.' });
  };

  // Leaving on success sends us back to the account screen, which refetches on focus and so shows
  // the new values straight away. An error stays put with everything typed still in place.
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
          <Text style={styles.title}>Mis datos</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Correo</Text>
              {/* Rendered as a locked row rather than a disabled input: a greyed-out field invites
                  tapping and looks like something is broken, while a lock reads as intentional. */}
              <View style={styles.locked}>
                <Text style={styles.lockedText} numberOfLines={1}>{email || '—'}</Text>
                <FontAwesome5 name="lock" size={13} solid color={t.textFaint} />
              </View>
              <Text style={styles.hint}>
                Tu correo identifica tu cuenta y no se puede cambiar.
              </Text>

              <Text style={[styles.label, styles.labelSpaced]}>Nombre y apellido</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ej. Ana Pérez"
                placeholderTextColor={t.textFaint}
                autoCapitalize="words"
              />

              <Text style={[styles.label, styles.labelSpaced]}>Teléfono</Text>
              <PhoneInput
                country={phoneCountry}
                national={phone}
                onChange={({ country, national }) => { setPhoneCountry(country); setPhone(national); }}
              />

              {/* Merchants only, and only once the saved flag has arrived. */}
              {isMerchant && closure != null ? (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>Mi comercio</Text>
                  <Pressable
                    style={styles.closureRow}
                    onPress={() => setClosedToday(!closedToday)}
                    accessibilityRole="button"
                    accessibilityState={{ checked: closedToday }}
                  >
                    <View style={[styles.checkbox, closedToday && styles.checkboxOn]}>
                      {closedToday ? <Text style={styles.checkboxTick}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.closureTitle}>Cerrado hoy</Text>
                      <Text style={styles.closureSub}>
                        {closedToday
                          ? 'Tus productos no aparecen en el mercado hoy; mañana abres normal.'
                          : 'Márcalo para no vender solo por hoy, sin tocar tu horario.'}
                      </Text>
                    </View>
                  </Pressable>
                  {closedToday ? (
                    <TextInput
                      style={[styles.input, styles.closureInput]}
                      value={closureNote}
                      onChangeText={setClosureNote}
                      placeholder="Nota (opcional). Ej: Cerrado por inventario"
                      placeholderTextColor={t.textFaint}
                    />
                  ) : null}
                </>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color={t.onAccent} />
                  : <Text style={styles.primaryText}>Guardar cambios</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
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
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  label: { color: t.text, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  labelSpaced: { marginTop: 18 },
  input: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15,
  },
  // Flatter and dimmer than an input, so it reads as information rather than a field.
  locked: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  lockedText: { flex: 1, color: t.textMuted, fontSize: 15 },
  hint: { color: t.textFaint, fontSize: 12, marginTop: 6 },
  closureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
  checkboxTick: { color: t.onAccent, fontWeight: '900', fontSize: 14 },
  closureTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  closureSub: { fontSize: 12, fontWeight: '600', color: t.textMuted, marginTop: 2, lineHeight: 17 },
  closureInput: { marginTop: 10 },
  footer: { paddingHorizontal: 16, paddingBottom: 8 },
  primary: {
    backgroundColor: t.accent, borderRadius: 14, minHeight: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
