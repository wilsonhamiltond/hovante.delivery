import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../src/api';
import { GradientBackground, t } from '../src/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  // The reset link (hovantedelivery://reset-password?token=...) lands here with the token in params.
  // If opened without one, the person can paste the token from the email instead.
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(typeof params.token === 'string' ? params.token : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasTokenFromLink = typeof params.token === 'string' && params.token.length > 0;

  const onSubmit = async () => {
    setError(null);
    if (!token.trim()) {
      setError('Falta el código del enlace de restablecimiento.');
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
    const res = await api.resetPassword(token.trim(), password);
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
          <Text style={styles.subtitle}>Elija una contraseña de al menos 7 caracteres.</Text>
        </View>

        {!hasTokenFromLink ? (
          <TextInput
            style={styles.input}
            placeholder="Código del enlace"
            placeholderTextColor={t.textFaint}
            autoCapitalize="none"
            value={token}
            onChangeText={setToken}
            editable={!submitting}
          />
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

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>Guardar contraseña</Text>}
        </Pressable>

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
  error: { color: t.danger, fontSize: 14 },
  button: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  link: { color: t.text, fontWeight: '800' },
});
