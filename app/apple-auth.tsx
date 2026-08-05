import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../src/auth';
import { GradientBackground, t } from '../src/theme';

// On web this screen IS the popup the auth session opened: this hands the URL (with the token on
// it) back to the login screen that opened it and closes the popup. No-op on native, where the
// redirect is a deep link the session catches itself.
WebBrowser.maybeCompleteAuthSession();

// Landing screen for the Apple callback (hovantedelivery://apple-auth?token=... on native,
// /apple-auth?token=... on web). Twin of app/google-auth.tsx and app/facebook-auth.tsx: it carries
// the sign-in on its own whenever the auth session cannot hand the token back -- the OS killed the
// app while the browser was in front, or the web popup was completed by hand.
export default function AppleAuthScreen() {
  const params = useLocalSearchParams<{ token?: string; error?: string }>();
  const { signInWithApple } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof params.token === 'string' ? params.token : '';
    if (!token) {
      const message = typeof params.error === 'string' ? params.error : '';
      setError(message || 'No se pudo iniciar sesión con Apple.');
      return;
    }
    // Adopting the token flips the auth gate in _layout, which redirects onwards from here.
    signInWithApple(token).then((err) => {
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
                <Text style={styles.buttonText}>Volver</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={t.text} />
              <Text style={styles.waiting}>Iniciando sesión con Apple…</Text>
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
