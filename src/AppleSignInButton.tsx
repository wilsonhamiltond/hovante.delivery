import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FontAwesome5 } from '@expo/vector-icons';
import { APPLE_REDIRECT_URI, APPLE_START_URL, parseAppleReturnUrl } from './appleAuth';
import { useAuth } from './auth';

interface Props {
  onError?: (message: string) => void;
  disabled?: boolean;
}

// "Continuar con Apple": opens the API's start endpoint and waits for the JWT to come back on the
// return link, exactly like the Google and Facebook buttons.
//
// This is Apple's *web* flow, which is why it is shown on every platform rather than iOS only. A
// native iOS build could instead use the system sheet (expo-apple-authentication), which is a nicer
// experience there and is what App Review expects of a shipped iOS app -- but it needs an entitlement,
// so it cannot run in Expo Go. The web flow works everywhere in the meantime.
export function AppleSignInButton({ onError, disabled }: Props) {
  const { signInWithApple } = useAuth();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(APPLE_START_URL, APPLE_REDIRECT_URI);

      // 'cancel' / 'dismiss': the person closed the sheet, nothing to report.
      if (result.type !== 'success') return;

      const { token, error } = parseAppleReturnUrl(result.url);
      if (!token) {
        onError?.(error ?? 'No se pudo iniciar sesión con Apple.');
        return;
      }

      const err = await signInWithApple(token);
      if (err) onError?.(err);
      // On success the auth gate in _layout redirects away from the login screen.
    } catch {
      onError?.('No se pudo iniciar sesión con Apple.');
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
      accessibilityLabel="Continuar con Apple"
    >
      {busy ? (
        <ActivityIndicator color="#0f172a" />
      ) : (
        <>
          <FontAwesome5 name="apple" brand size={20} color="#0f172a" style={styles.logoIcon} />
          <Text style={styles.buttonText}>Continuar con Apple</Text>
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
