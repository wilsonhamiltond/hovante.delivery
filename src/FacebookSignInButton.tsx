import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FontAwesome5 } from '@expo/vector-icons';
import { FACEBOOK_REDIRECT_URI, FACEBOOK_START_URL, parseFacebookReturnUrl } from './facebookAuth';
import { useAuth } from './auth';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { error: string; label: string }> = {
  es: {
    error: 'No se pudo iniciar sesión con Facebook.',
    label: 'Continuar con Facebook',
  },
  en: {
    error: 'Could not sign in with Facebook.',
    label: 'Continue with Facebook',
  },
};

interface Props {
  onError?: (message: string) => void;
  disabled?: boolean;
}

// "Continuar con Facebook": opens the API's OAuth start endpoint and waits for it to bounce back
// with a JWT. openAuthSessionAsync is what makes the wait possible -- it keeps the session tied to
// the app (a browser tab on native, a popup on web) and resolves with the redirect URL, so the
// token never has to be pasted or polled for. Both platforms are wired; only the return address
// differs, which facebookAuth works out.
//
// Unlike Google there is nothing to configure in the app: the app id and secret live only on the
// API, which is why this button is always shown. If the API has no Facebook credentials set, its
// start endpoint answers with a plain 400 in the browser rather than a broken dialog.
export function FacebookSignInButton({ onError, disabled }: Props) {
  const { signInWithFacebook } = useAuth();
  const [busy, setBusy] = useState(false);
  const tx = useStrings(S);

  const onPress = async () => {
    setBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(FACEBOOK_START_URL, FACEBOOK_REDIRECT_URI);

      // 'cancel' (closed the dialog) and 'dismiss' are not failures: say nothing and let them retry.
      if (result.type !== 'success') return;

      const { token, error } = parseFacebookReturnUrl(result.url);
      if (!token) {
        // Every API-side failure -- denied dialog, bad state, no email on the account -- arrives as
        // a ready-to-show message on the link.
        onError?.(error ?? tx.error);
        return;
      }

      const err = await signInWithFacebook(token);
      if (err) onError?.(err);
      // On success the auth gate in _layout redirects away from the login screen.
    } catch {
      onError?.(tx.error);
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
      accessibilityLabel={tx.label}
    >
      {busy ? (
        <ActivityIndicator color="#0f172a" />
      ) : (
        <>
          <FontAwesome5 name="facebook-f" brand size={18} color="#1877F2" style={styles.logoIcon} />
          <Text style={styles.buttonText}>{tx.label}</Text>
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
