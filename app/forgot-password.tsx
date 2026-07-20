import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../src/api';
import { GradientBackground, t } from '../src/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
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
    // request was accepted -- we always show the same confirmation.
    if (!res.success) {
      setError(res.message);
      return;
    }
    setSent(true);
  };

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Restablecer contraseña</Text>
          <Text style={styles.subtitle}>
            {sent
              ? 'Si existe una cuenta con ese correo, le enviamos un enlace para restablecer su contraseña. Revise su bandeja de entrada.'
              : 'Ingrese su correo y le enviaremos un enlace para crear una nueva contraseña.'}
          </Text>
        </View>

        {!sent ? (
          <>
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
              {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>Enviar enlace</Text>}
            </Pressable>
          </>
        ) : (
          <Link href="/reset-password" style={styles.altButton}>
            <Text style={styles.altButtonText}>Ya tengo un código</Text>
          </Link>
        )}

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
  altButton: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  altButtonText: { color: t.text, fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: t.textMuted },
  link: { color: t.text, fontWeight: '800' },
});
