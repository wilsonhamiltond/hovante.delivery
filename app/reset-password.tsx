import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../src/api';
import { GradientBackground, t } from '../src/theme';

// How long the resend link stays disabled after a request. Every tap sends a real email, so a
// permanently enabled link is a way to flood someone's inbox -- and to burn whatever sending quota
// the API's mailer has -- by tapping one word repeatedly.
const RESEND_COOLDOWN_SECONDS = 45;

export default function ResetPasswordScreen() {
  const router = useRouter();
  // The reset link (hovantedelivery://reset-password?token=...) lands here with the token in params.
  // If opened without one, the person can paste the token from the email instead.
  //
  // `email` arrives instead when this screen was reached by requesting a code rather than by
  // following the link, and only names the inbox to go and look in.
  const params = useLocalSearchParams<{ token?: string; email?: string }>();
  const sentTo = typeof params.email === 'string' ? params.email : null;
  const [token, setToken] = useState(typeof params.token === 'string' ? params.token : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Ticks the resend cooldown down to zero, one second at a time.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const hasTokenFromLink = typeof params.token === 'string' && params.token.length > 0;

  // Only offered when the address is known -- that is, when this screen was reached by asking for a
  // code. Arriving on the emailed link brings a token but no address, so there would be nothing to
  // resend to; the link is left out rather than shown broken.
  const onResend = async () => {
    if (!sentTo || resending || cooldown > 0) return;
    setError(null);
    setNotice(null);
    setResending(true);
    const res = await api.forgotPassword(sentTo);
    setResending(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    // Hedged like the subtitle above: the endpoint answers identically for an address with no
    // account, so confirming outright that an email went out would leak which addresses exist.
    setNotice('Si existe una cuenta, le enviamos otro código.');
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const onSubmit = async () => {
    setError(null);
    // Two ways in, two proofs: the deep link carries the long token; arriving by requesting a
    // code carries the email, and the person types the 6 digits the mail showed -- the same
    // gesture as the sign-up verification step.
    const typedCode = token.trim();
    if (sentTo ? typedCode.length !== 6 : !typedCode) {
      setError(sentTo ? 'Escribe el código de 6 dígitos del correo.' : 'Falta el código del enlace de restablecimiento.');
      return;
    }
    if (password.length < 7) {
      setError('La contraseña debe tener al menos 7 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    const res = sentTo && !hasTokenFromLink
      ? await api.resetPasswordWithCode(sentTo, typedCode, password)
      : await api.resetPassword(typedCode, password);
    setSubmitting(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Contraseña actualizada</Text>
            <Text style={styles.subtitle}>Ya puede iniciar sesión con su nueva contraseña.</Text>
          </View>
          <Pressable style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Nueva contraseña</Text>
          <Text style={styles.subtitle}>
            {/* Deliberately "si existe una cuenta": the request endpoint answers the same whether or
                not the address is registered, and promising a code outright here would leak which
                addresses have accounts. */}
            {sentTo
              ? `Si existe una cuenta con ${sentTo}, le enviamos un código de 6 dígitos. Escríbalo aquí con su nueva contraseña.`
              : 'Elija una contraseña de al menos 7 caracteres.'}
          </Text>
        </View>

        {!hasTokenFromLink ? (
          sentTo ? (
            // The typed path: the same centred 6-digit box as the sign-up verification step, so
            // the gesture is one the person has already performed once.
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="••••••"
              placeholderTextColor={t.textFaint}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              value={token}
              onChangeText={(v) => setToken(v.replace(/[^0-9]/g, '').slice(0, 6))}
              editable={!submitting}
            />
          ) : (
            // No email in hand (opened from "Ya tengo un código" or a bare deep link): accept
            // whatever the mail carried, pasted whole.
            <TextInput
              style={styles.input}
              placeholder="Código del enlace"
              placeholderTextColor={t.textFaint}
              autoCapitalize="none"
              value={token}
              onChangeText={setToken}
              editable={!submitting}
            />
          )
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Nueva contraseña"
          placeholderTextColor={t.textFaint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmar contraseña"
          placeholderTextColor={t.textFaint}
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          editable={!submitting}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>Guardar contraseña</Text>}
        </Pressable>

        {sentTo ? (
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>¿No recibió el código? </Text>
            <Pressable
              onPress={onResend}
              disabled={resending || cooldown > 0 || submitting}
              accessibilityRole="button"
              accessibilityLabel="Reenviar código"
            >
              <Text style={[styles.resendLink, (resending || cooldown > 0) && styles.resendLinkOff]}>
                {resending ? 'Enviando…' : cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Link href="/login" style={styles.link}>Volver a iniciar sesión</Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14, maxWidth: 440, width: '100%', alignSelf: 'center' },
  header: { marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '900', color: t.text },
  subtitle: { fontSize: 15, color: t.textMuted, marginTop: 4, lineHeight: 21 },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 12 },
  error: { color: t.danger, fontSize: 14 },
  notice: { color: t.textMuted, fontSize: 14, lineHeight: 20 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  resendText: { color: t.textMuted, fontSize: 14 },
  resendLink: { color: t.text, fontSize: 14, fontWeight: '800' },
  resendLinkOff: { color: t.textFaint, fontWeight: '600' },
  button: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  link: { color: t.text, fontWeight: '800' },
});
