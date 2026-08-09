import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as api from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { GradientBackground, t } from '../src/theme';

// Server-side minimum (UserService.ChangePasswordAsync). Checked here too so the mistake is caught
// before a round trip, but the server remains the authority.
const MIN_LENGTH = 7;

// Change the password of the signed-in account, reached from "Mi cuenta".
//
// The current password is asked for and verified server-side. The bearer token alone is not treated
// as proof on this screen: it lives on the phone and outlives any single session, so without the
// check a moment with an unlocked handset would be enough to lock the owner out of their account.
export default function ChangePasswordScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  const submit = async () => {
    // Checked in the order the fields appear on screen, so the message always points at the first
    // thing to fix rather than the last thing checked.
    if (!current) return setNotice({ tone: 'error', message: 'Escribe tu contraseña actual.' });
    if (!next) return setNotice({ tone: 'error', message: 'Escribe tu nueva contraseña.' });
    if (next.length < MIN_LENGTH) {
      return setNotice({ tone: 'error', message: `La nueva contraseña debe tener al menos ${MIN_LENGTH} caracteres.` });
    }
    if (next === current) {
      return setNotice({ tone: 'error', message: 'La nueva contraseña debe ser distinta de la actual.' });
    }
    if (next !== confirm) {
      return setNotice({ tone: 'error', message: 'Las contraseñas no coinciden.' });
    }

    setSubmitting(true);
    const res = await api.changePassword(current, next);
    setSubmitting(false);

    if (!res.success) {
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    // The token is not invalidated by the change, so the session continues -- nothing to sign out
    // of and back into.
    setNotice({ tone: 'success', message: 'Tu contraseña fue actualizada.' });
  };

  // Dismissing the success notice leaves the screen; dismissing an error stays put so the fields
  // keep what was typed.
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
          <Text style={styles.title}>Contraseña</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>
              Escribe tu contraseña actual y la nueva. Seguirás con la sesión iniciada.
            </Text>

            <Text style={styles.label}>Contraseña actual</Text>
            <TextInput
              style={styles.input}
              value={current}
              onChangeText={setCurrent}
              placeholder="Tu contraseña actual"
              placeholderTextColor={t.textFaint}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
            />

            <Text style={[styles.label, styles.labelSpaced]}>Nueva contraseña</Text>
            <TextInput
              style={styles.input}
              value={next}
              onChangeText={setNext}
              placeholder={`Al menos ${MIN_LENGTH} caracteres`}
              placeholderTextColor={t.textFaint}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />

            <Text style={[styles.label, styles.labelSpaced]}>Repetir nueva contraseña</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Escríbela otra vez"
              placeholderTextColor={t.textFaint}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              onSubmitEditing={submit}
              returnKeyType="done"
            />

          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color={t.onAccent} />
                : <Text style={styles.primaryText}>Guardar contraseña</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        <NoticeDialog notice={notice} onClose={dismiss} />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  lead: { color: t.textMuted, fontSize: 14, marginBottom: 18 },
  label: { color: t.text, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  labelSpaced: { marginTop: 16 },
  input: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15,
  },
  footer: { paddingHorizontal: 16, paddingBottom: 8 },
  primary: {
    backgroundColor: t.accent, borderRadius: 14, minHeight: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
