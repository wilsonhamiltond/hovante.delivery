import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_VERSION_LABEL } from '../src/appVersion';
import { AppleSignInButton } from '../src/AppleSignInButton';
import { FacebookSignInButton } from '../src/FacebookSignInButton';
import { GoogleSignInButton } from '../src/GoogleSignInButton';
import { GradientBackground, t } from '../src/theme';

// Welcome / step 1 of onboarding: the Volao logo over the gradient, the three social sign-in
// options, and a way in with an email + phone instead (which starts the register wizard).
//
// All three social sign-ins are wired to the same flow: each hands its whole OAuth dialog to the
// API (/auth/facebook/start, /auth/google/start, /auth/apple/start) and comes back on a return link
// carrying the JWT. None of them needs a provider credential in the app.
export default function WelcomeScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
          {false && <FacebookSignInButton onError={setError} />}

          <GoogleSignInButton onError={setError} />

          <AppleSignInButton onError={setError} />

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

          {APP_VERSION_LABEL ? <Text style={styles.version}>Versión {APP_VERSION_LABEL}</Text> : null}
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
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.border },
  dividerText: { color: t.textMuted, fontSize: 13 },

  other: { borderWidth: 1, borderColor: t.border, backgroundColor: t.card, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  otherText: { color: t.text, fontSize: 16, fontWeight: '800' },
  signIn: { alignItems: 'center', paddingVertical: 6 },
  signInText: { color: t.textMuted, fontSize: 14 },
  signInStrong: { color: t.text, fontWeight: '800' },
  // Faint on purpose: useful when someone is reporting a problem, not something to read past on
  // the way in.
  version: { color: t.textFaint, fontSize: 12, textAlign: 'center', marginTop: 2 },
});
