import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FontAwesome5 } from '@expo/vector-icons';
import { GOOGLE_REDIRECT_URI, GOOGLE_START_URL, parseGoogleReturnUrl } from './googleAuth';
import { useAuth } from './auth';

interface Props {
  onError?: (message: string) => void;
  disabled?: boolean;
}

// "Continuar con Google": opens the API's OAuth start endpoint and waits for it to bounce back
// with a JWT, exactly like the Facebook button. openAuthSessionAsync keeps the session tied to the
// app -- a browser tab on native, a popup on web -- and resolves with the redirect URL.
//
// There is nothing to configure in the app: the client id and secret live only on the API, which
// is why this button is always shown. If the API has no Google credentials set, its start endpoint
// answers with a plain 400 in the browser rather than a broken consent screen.
export function GoogleSignInButton({ onError, disabled }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(GOOGLE_START_URL, GOOGLE_REDIRECT_URI);

      // 'cancel' (closed the browser) and 'dismiss' are not failures: say nothing, let them retry.
      if (result.type !== 'success') return;

      const { token, error } = parseGoogleReturnUrl(result.url);
      if (!token) {
        // Every API-side failure -- declined consent, bad state, unverified email -- arrives as a
        // ready-to-show message on the link.
        onError?.(error ?? 'No se pudo iniciar sesión con Google.');
        return;
      }

      const err = await signInWithGoogle(token);
      if (err) onError?.(err);
      // On success the auth gate in _layout redirects away from the login screen.
    } catch {
      onError?.('No se pudo iniciar sesión con Google.');
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;

  return (
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
          <FontAwesome5 name="google" brand size={18} color="#4285F4" style={styles.logoIcon} />
          <Text style={styles.buttonText}>Continuar con Google</Text>
        </>
      )}
    </Pressable>
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
  logoIcon: { width: 22, textAlign: 'center' },
});
