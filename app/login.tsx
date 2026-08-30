import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_VERSION_LABEL } from '../src/appVersion';
import { AppleSignInButton } from '../src/AppleSignInButton';
import { FacebookSignInButton } from '../src/FacebookSignInButton';
import { GoogleSignInButton } from '../src/GoogleSignInButton';
import { GradientBackground, t } from '../src/theme';
import { LOCALES, LOCALE_LABELS, useLocale, useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    tagline: string;
    or: string;
    continueWithEmail: string;
    haveAccount: string;
    signIn: string;
    exploreAsGuest: string;
    version: (label: string) => string;
  }
> = {
  es: {
    tagline: 'Pide lo que quieras, te lo llevamos',
    or: 'o',
    continueWithEmail: 'Continuar con correo o teléfono',
    haveAccount: '¿Ya tienes cuenta? ',
    signIn: 'Inicia sesión',
    exploreAsGuest: 'Explorar sin cuenta',
    version: (label) => `Versión ${label}`,
  },
  en: {
    tagline: 'Order anything, we bring it to you',
    or: 'or',
    continueWithEmail: 'Continue with email or phone',
    haveAccount: 'Already have an account? ',
    signIn: 'Sign in',
    exploreAsGuest: 'Browse without an account',
    version: (label) => `Version ${label}`,
  },
};

// Welcome / step 1 of onboarding: the Volao logo over the gradient, the three social sign-in
// options, and a way in with an email + phone instead (which starts the register wizard).
//
// All three social sign-ins are wired to the same flow: each hands its whole OAuth dialog to the
// API (/auth/facebook/start, /auth/google/start, /auth/apple/start) and comes back on a return link
// carrying the JWT. None of them needs a provider credential in the app.
export default function WelcomeScreen() {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const tx = useStrings(S);
  const [error, setError] = useState<string | null>(null);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Language, before signing in: the first screen a new user sees is the one place the
            Cuenta selector cannot help them. Same persisted choice as that screen. */}
        <View style={styles.langBar}>
          {LOCALES.map((l) => (
            <Pressable
              key={l}
              onPress={() => setLocale(l)}
              style={[styles.langPill, locale === l && styles.langPillActive]}
              accessibilityRole="button"
              accessibilityLabel={LOCALE_LABELS[l]}
              accessibilityState={{ selected: locale === l }}
            >
              <Text style={[styles.langPillText, locale === l && styles.langPillTextActive]}>
                {l.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.hero}>
          <Image
            source={require('../assets/volao-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Volao"
          />
          <Text style={styles.tagline}>{tx.tagline}</Text>
        </View>

        <View style={styles.actions}>
          {false && <FacebookSignInButton onError={setError} />}

          <GoogleSignInButton onError={setError} />

          <AppleSignInButton onError={setError} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{tx.or}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* "Start with something else": the email + phone route, i.e. the register wizard. */}
          <Pressable style={styles.other} onPress={() => router.push('/register')} accessibilityRole="button">
            <Text style={styles.otherText}>{tx.continueWithEmail}</Text>
          </Pressable>

          <Pressable style={styles.signIn} onPress={() => router.push('/email-login')} accessibilityRole="button">
            <Text style={styles.signInText}>{tx.haveAccount}<Text style={styles.signInStrong}>{tx.signIn}</Text></Text>
          </Pressable>

          {/* Browsing needs no account (guideline 5.1.1): the marketplace is open as a guest, and
              signing in is only asked for at the account-based steps (ordering, addresses). */}
          <Pressable style={styles.signIn} onPress={() => router.replace('/home')} accessibilityRole="button">
            <Text style={styles.signInText}>{tx.exploreAsGuest}</Text>
          </Pressable>

          {APP_VERSION_LABEL ? <Text style={styles.version}>{tx.version(APP_VERSION_LABEL)}</Text> : null}
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  // Same pill treatment as the Cuenta screen's language card, shrunk to a corner control.
  langBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  langPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.card },
  langPillActive: { backgroundColor: t.accent, borderColor: t.accent },
  langPillText: { color: t.text, fontWeight: '800', fontSize: 13 },
  langPillTextActive: { color: t.onAccent },
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
