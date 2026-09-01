import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../src/auth';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<Locale, { failed: string; goBack: string; signingIn: string }> = {
  es: {
    failed: 'No se pudo iniciar sesión con Google.',
    goBack: 'Volver',
    signingIn: 'Iniciando sesión con Google…',
  },
  en: {
    failed: 'Could not sign in with Google.',
    goBack: 'Go back',
    signingIn: 'Signing in with Google…',
  },
  fr: {
    failed: 'Impossible de se connecter avec Google.',
    goBack: 'Retour',
    signingIn: 'Connexion avec Google…',
  },
};

// On web this screen IS the popup the auth session opened: this hands the URL (with the token on
// it) back to the login screen that opened it and closes the popup. No-op on native, where the
// redirect is a deep link the session catches itself.
WebBrowser.maybeCompleteAuthSession();

// Landing screen for the Google callback (hovantedelivery://google-auth?token=... on native,
// /google-auth?token=... on web). The Facebook twin of this is app/facebook-auth.tsx; both exist
// because a token on the return link must never be dropped when the auth session cannot hand it
// back -- the OS killed the app while the browser was in front, or the popup was closed by hand.
export default function GoogleAuthScreen() {
  const params = useLocalSearchParams<{ token?: string; error?: string }>();
  const { signInWithGoogle } = useAuth();
  const router = useRouter();
  const tx = useStrings(S);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof params.token === 'string' ? params.token : '';
    if (!token) {
      const message = typeof params.error === 'string' ? params.error : '';
      setError(message || tx.failed);
      return;
    }
    // Adopting the token flips the auth gate in _layout, which redirects onwards from here.
    signInWithGoogle(token).then((err) => {
      if (err) setError(err);
    });
  }, [params.token, params.error]);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {error ? (
            <>
              <Text style={styles.error}>{error}</Text>
              <Pressable style={styles.button} onPress={() => router.replace('/login')} accessibilityRole="button">
                <Text style={styles.buttonText}>{tx.goBack}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={t.text} />
              <Text style={styles.waiting}>{tx.signingIn}</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  waiting: { color: t.textMuted, fontSize: 15, textAlign: 'center' },
  error: { color: t.danger, fontSize: 15, textAlign: 'center' },
  button: {
    borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  buttonText: { color: t.text, fontSize: 16, fontWeight: '800' },
});
