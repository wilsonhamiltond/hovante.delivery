import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { GoogleSignInButton } from '../src/GoogleSignInButton';
import { GradientBackground, t } from '../src/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Ingrese correo y contraseña.');
      return;
    }
    setSubmitting(true);
    const err = await signIn(email.trim(), password);
    setSubmitting(false);
    // On success the gate in _layout redirects; only a failure surfaces here.
    if (err) setError(err);
  };

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Volao</Text>
          <Text style={styles.subtitle}>Inicie sesión para continuar</Text>
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
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={t.textFaint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Link href="/forgot-password" style={styles.forgot}>¿Olvidó su contraseña?</Link>

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>Iniciar sesión</Text>}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>o</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* A Google sign-in creates a customer account by default; drivers register explicitly. */}
        <GoogleSignInButton type="client" onError={setError} disabled={submitting} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿No tiene cuenta? </Text>
          <Link href="/register" style={styles.link}>Regístrese</Link>
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
  title: { fontSize: 34, fontWeight: '900', color: t.text, letterSpacing: 0.5 },
  subtitle: { fontSize: 15, color: t.textMuted, marginTop: 4 },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text },
  error: { color: t.danger, fontSize: 14 },
  button: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  forgot: { color: t.text, fontWeight: '700', textAlign: 'right', fontSize: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.border },
  dividerText: { color: t.textMuted, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: t.textMuted },
  link: { color: t.text, fontWeight: '800' },
});
