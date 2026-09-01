import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    missingFields: string;
    title: string;
    subtitle: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    forgot: string;
    signIn: string;
    noAccount: string;
    register: string;
  }
> = {
  es: {
    missingFields: 'Ingrese correo y contraseña.',
    title: 'Iniciar sesión',
    subtitle: 'Ingresa con tu correo y contraseña',
    emailPlaceholder: 'Correo electrónico',
    passwordPlaceholder: 'Contraseña',
    forgot: '¿Olvidó su contraseña?',
    signIn: 'Iniciar sesión',
    noAccount: '¿No tienes cuenta? ',
    register: 'Regístrate',
  },
  en: {
    missingFields: 'Enter your email and password.',
    title: 'Sign in',
    subtitle: 'Sign in with your email and password',
    emailPlaceholder: 'Email address',
    passwordPlaceholder: 'Password',
    forgot: 'Forgot your password?',
    signIn: 'Sign in',
    noAccount: "Don't have an account? ",
    register: 'Sign up',
  },
  fr: {
    missingFields: 'Saisissez votre e-mail et votre mot de passe.',
    title: 'Se connecter',
    subtitle: 'Connectez-vous avec votre e-mail et votre mot de passe',
    emailPlaceholder: 'Adresse e-mail',
    passwordPlaceholder: 'Mot de passe',
    forgot: 'Mot de passe oublié ?',
    signIn: 'Se connecter',
    noAccount: 'Vous n’avez pas de compte ? ',
    register: 'Inscrivez-vous',
  },
};

// Sign in with an existing account. Reached from the welcome screen's "Ya tengo cuenta"; new users
// go through the register wizard instead.
export default function EmailLoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const tx = useStrings(S);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // For the email field's "next": submitting the first field walks to the second.
  const passwordRef = useRef<TextInput>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(tx.missingFields);
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
        <View style={styles.header}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))} />
        </View>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.title}>{tx.title}</Text>
          <Text style={styles.subtitle}>{tx.subtitle}</Text>

          <TextInput
            style={styles.input}
            placeholder={tx.emailPlaceholder}
            placeholderTextColor={t.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
            // Enter (web) or the keyboard's action key (native) moves on to the password instead
            // of just closing the keyboard. submitBehavior="submit" keeps the keyboard up through
            // the hop so it does not flicker down and back.
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextInput
            style={styles.input}
            placeholder={tx.passwordPlaceholder}
            placeholderTextColor={t.textFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
            ref={passwordRef}
            // Enter here IS the login button: same handler, same validation, so a half-filled
            // form gets the inline error rather than nothing happening.
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Link href="/forgot-password" style={styles.forgot}>{tx.forgot}</Link>

          <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>{tx.signIn}</Text>}
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{tx.noAccount}</Text>
            <Link href="/login" style={styles.link}>{tx.register}</Link>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14, maxWidth: 440, width: '100%', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: t.text },
  subtitle: { fontSize: 15, color: t.textMuted, marginTop: -6, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text },
  error: { color: t.danger, fontSize: 14 },
  button: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  forgot: { color: t.text, fontWeight: '700', textAlign: 'right', fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: t.textMuted },
  link: { color: t.text, fontWeight: '800' },
});
