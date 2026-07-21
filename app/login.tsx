import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { GoogleSignInButton } from '../src/GoogleSignInButton';
import { GradientBackground, t } from '../src/theme';

// Welcome / step 1 of onboarding: the Volao logo over the gradient, the three social sign-in
// options, and a way in with an email + phone instead (which starts the register wizard).
//
// Google is wired to the real flow (GoogleSignInButton). Facebook and Apple are presented but the
// API has no endpoint for them yet -- /auth/google is the only social exchange -- so they explain
// that rather than failing silently. Wiring them up means a provider app id plus an /auth/facebook
// and /auth/apple on the API.
export default function WelcomeScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const notWired = (provider: string) =>
    setError(`Iniciar con ${provider} aún no está disponible. Usa Google o tu correo.`);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.hero}>
          <Image
            source={require('../assets/volao-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Volao"
          />
          <Text style={styles.tagline}>Pide lo que quieras, te lo llevamos</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.social} onPress={() => notWired('Facebook')} accessibilityRole="button">
            <FontAwesome5 name="facebook-f" brand size={18} color="#1877F2" style={styles.socialIcon} />
            <Text style={styles.socialText}>Continuar con Facebook</Text>
          </Pressable>

          <GoogleSignInButton type="client" onError={setError} />

          <Pressable style={styles.social} onPress={() => notWired('Apple')} accessibilityRole="button">
            <FontAwesome5 name="apple" brand size={20} color="#0f172a" style={styles.socialIcon} />
            <Text style={styles.socialText}>Continuar con Apple</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* "Start with something else": the email + phone route, i.e. the register wizard. */}
          <Pressable style={styles.other} onPress={() => router.push('/register')} accessibilityRole="button">
            <Text style={styles.otherText}>Continuar con correo o teléfono</Text>
          </Pressable>

          <Pressable style={styles.signIn} onPress={() => router.push('/email-login')} accessibilityRole="button">
            <Text style={styles.signInText}>¿Ya tienes cuenta? <Text style={styles.signInStrong}>Inicia sesión</Text></Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  logo: { width: 260, height: 200 },
  tagline: { color: t.textMuted, fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: -10 },

  actions: { padding: 24, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center' },
  social: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 13,
  },
  socialIcon: { width: 22, textAlign: 'center' },
  socialText: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.border },
  dividerText: { color: t.textMuted, fontSize: 13 },

  other: { borderWidth: 1, borderColor: t.border, backgroundColor: t.card, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  otherText: { color: t.text, fontSize: 16, fontWeight: '800' },
  signIn: { alignItems: 'center', paddingVertical: 6 },
  signInText: { color: t.textMuted, fontSize: 14 },
  signInStrong: { color: t.text, fontWeight: '800' },
});
