import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from './api';
import { APPLE_REDIRECT_URI, APPLE_START_URL, parseAppleReturnUrl } from './appleAuth';
import { EXPO_GO_SOCIAL_MESSAGE, IS_EXPO_GO } from './expoGo';
import { useAuth } from './auth';

interface Props {
  onError?: (message: string) => void;
  disabled?: boolean;
}

// "Continuar con Apple". On iOS this is the NATIVE system sheet (expo-apple-authentication): the
// person confirms with Face ID and never leaves the app, which is both the better experience and
// what App Review expects of a shipped iOS app -- the 1.0 review failed on the browser flow here.
// The sheet hands back an identity token that the API verifies directly (POST /auth/apple).
//
// Everywhere the sheet does not exist (web, Android, and any iOS build without the entitlement),
// the button falls back to Apple's web flow: open the API's start endpoint, wait for the JWT to
// come back on the return link -- exactly like the Google and Facebook buttons.
export function AppleSignInButton({ onError, disabled }: Props) {
  const { signInWithApple } = useAuth();
  const [busy, setBusy] = useState(false);

  const signInNative = async (): Promise<void> => {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (e) {
      // The person closed the sheet: nothing to report.
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      onError?.('No se pudo iniciar sesión con Apple.');
      return;
    }

    if (!credential.identityToken) {
      onError?.('No se pudo iniciar sesión con Apple.');
      return;
    }

    // Apple only reports the name on the FIRST authorisation; a returning user's credential
    // carries none, and their account keeps the name it was created with.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean).join(' ').trim();

    const res = await api.loginWithAppleNative(credential.identityToken, name || undefined);
    if (!res.success) {
      onError?.(res.message || 'No se pudo iniciar sesión con Apple.');
      return;
    }
    const err = await signInWithApple(res.data);
    if (err) onError?.(err);
    // On success the auth gate in _layout redirects away from the login screen.
  };

  const signInWeb = async (): Promise<void> => {
    // Inside Expo Go the API's return link (hovantedelivery://apple-auth) points at a scheme no
    // installed app owns, so the browser opens, Apple succeeds, and nothing ever comes back. Say
    // so up front rather than leaving someone staring at a page that will not close.
    if (IS_EXPO_GO) {
      onError?.(EXPO_GO_SOCIAL_MESSAGE);
      return;
    }

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
  };

  const onPress = async () => {
    setBusy(true);
    try {
      // isAvailableAsync answers false anywhere the sheet cannot run (web, Android, an iOS build
      // without the Sign in with Apple entitlement), so the fallback needs no platform matrix of
      // its own -- asking is the check.
      const nativeAvailable = Platform.OS === 'ios' && await AppleAuthentication.isAvailableAsync();
      if (nativeAvailable) await signInNative();
      else await signInWeb();
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
