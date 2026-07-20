import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GOOGLE_CLIENT_IDS, GOOGLE_ENABLED } from './config';
import { useAuth } from './auth';

// Finishes the auth session if the app was reopened by the OAuth redirect (web / native).
WebBrowser.maybeCompleteAuthSession();

interface Props {
  // Which kind of account to create if this Google user is new. A returning user keeps their type.
  type?: 'client' | 'driver';
  onError?: (message: string) => void;
  disabled?: boolean;
}

// "Continuar con Google": runs the device Google flow to get an ID token, then hands it to the auth
// context, which exchanges it for our JWT. Hidden in a production build until the client ids are
// configured (so a shipped app never offers a dead button); in development it stays visible but
// disabled, with a hint, so the wiring is testable.
export function GoogleSignInButton({ type = 'client', onError, disabled }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.webClientId,
    iosClientId: GOOGLE_CLIENT_IDS.iosClientId,
    androidClientId: GOOGLE_CLIENT_IDS.androidClientId,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token ?? response.authentication?.idToken ?? null;
      if (!idToken) {
        setBusy(false);
        onError?.('Google no devolvió un token de identidad.');
        return;
      }
      signInWithGoogle(idToken, type).then((err) => {
        setBusy(false);
        if (err) onError?.(err);
        // On success the auth gate in _layout redirects away from the login screen.
      });
    } else {
      // 'error', 'cancel' or 'dismiss': stop the spinner, surface only real errors.
      setBusy(false);
      if (response.type === 'error') onError?.('No se pudo iniciar sesión con Google.');
    }
  }, [response]);

  // Not configured and shipping: don't render a button that can't work.
  if (!GOOGLE_ENABLED && !__DEV__) return null;

  const onPress = () => {
    if (!GOOGLE_ENABLED) {
      onError?.('Configure GOOGLE_CLIENT_IDS en src/config.ts para habilitar Google.');
      return;
    }
    setBusy(true);
    promptAsync();
  };

  const isDisabled = disabled || busy || (GOOGLE_ENABLED && !request);

  return (
    <View>
      <Pressable
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel="Continuar con Google"
      >
        {busy ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <>
            <View style={styles.logo}>
              <Text style={styles.logoText}>G</Text>
            </View>
            <Text style={styles.buttonText}>Continuar con Google</Text>
          </>
        )}
      </Pressable>
      {!GOOGLE_ENABLED && __DEV__ ? (
        <Text style={styles.hint}>Configure GOOGLE_CLIENT_IDS en src/config.ts</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 13,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  logo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#4285F4', fontSize: 15, fontWeight: '800' },
  hint: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
