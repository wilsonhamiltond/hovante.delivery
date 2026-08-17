import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../src/api';
import { GradientBackground, t } from '../src/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Ingrese su correo electrónico.');
      return;
    }
    setSubmitting(true);
    const res = await api.forgotPassword(email.trim());
    setSubmitting(false);
    // The server answers the same whether or not the email exists, so a success just means the
    // request was accepted.
    if (!res.success) {
      setError(res.message);
      return;
    }
    // Straight on to the step that actually finishes the job. This used to stop at a "revise su
    // bandeja" message that could only be left by tapping "Ya tengo un código" -- a dead end asking
    // the person to come back and find their own way forward. The address travels along so the next
    // screen can say where the code went. Pushed, not replaced, so the back gesture returns here to
    // correct a mistyped address.
    router.push({ pathname: '/reset-password', params: { email: email.trim() } });
  };

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Restablecer contraseña</Text>
          <Text style={styles.subtitle}>
            Ingrese su correo y le enviaremos un código para crear una nueva contraseña.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor={t.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>Enviar código</Text>}
        </Pressable>

        {/* Kept, but moved to the entry step: someone who still has a code from an earlier email
            should not have to request a new one just to reach the form.

            asChild so the Link renders as a Pressable rather than an anchor wrapping a Text: an
            anchor does not centre its child, which is why this label used to sit left while the
            primary button's sat centred, and it left the padding around the text untappable. */}
        <Link href="/reset-password" asChild>
          <Pressable style={styles.altButton} accessibilityRole="button">
            <Text style={styles.altButtonText}>Ya tengo un código</Text>
          </Pressable>
        </Link>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿La recordó? </Text>
          <Link href="/login" style={styles.link}>Iniciar sesión</Link>
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
  error: { color: t.danger, fontSize: 14 },
  button: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  // The secondary action, styled like the one on the welcome screen so the pair reads as the app's
  // one "other way in" button: same height and radius as the primary above it, but outlined over
  // the glass instead of filled, which is what puts them in order rather than in competition.
  altButton: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  altButtonText: { color: t.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: t.textMuted },
  link: { color: t.text, fontWeight: '800' },
});
