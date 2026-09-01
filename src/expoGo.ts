import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { strings, type Locale } from './i18n';

// Whether the app is running inside the Expo Go client rather than as its own installed build.
//
// This matters for the social sign-ins. All three are browser flows: the app opens the API's start
// URL, and the API sends the browser back to `hovantedelivery://<provider>-auth` when it is done.
// That scheme is registered by the app's own Android/iOS build -- Expo Go does not and cannot
// register another app's scheme, so inside Expo Go the browser has nowhere to hand the result to
// and the flow dead-ends on a page that never returns.
//
// The API deliberately will not accept a redirect supplied by the caller (it would be an open
// redirect), so there is no Expo Go URL it could be told to use instead. Signing in with Google,
// Facebook or Apple therefore needs the installed build -- the APK from EAS, or a dev build.
// Email and password work everywhere.
export const IS_EXPO_GO =
  Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const S: Record<Locale, { socialMessage: string }> = {
  es: {
    socialMessage:
      'El inicio de sesión con Google, Facebook y Apple no funciona dentro de Expo Go. '
      + 'Usa la app instalada (el APK), o entra con tu correo y contraseña.',
  },
  en: {
    socialMessage:
      'Signing in with Google, Facebook, and Apple does not work inside Expo Go. '
      + 'Use the installed app (the APK), or sign in with your email and password.',
  },
  fr: {
    socialMessage:
      'La connexion avec Google, Facebook et Apple ne fonctionne pas dans Expo Go. '
      + 'Utilisez l’application installée (l’APK), ou connectez-vous avec votre e-mail et votre mot de passe.',
  },
};

/** What to tell someone who taps a social sign-in inside Expo Go. A function (not a constant) so
 * a language switch is picked up at the moment the message is shown. */
export function expoGoSocialMessage(): string {
  return strings(S).socialMessage;
}
