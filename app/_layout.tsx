import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/auth';
import { CartProvider } from '../src/cart';
import { SessionLocationProvider } from '../src/sessionLocation';
import {
  configureNotificationHandler, routeForNotification, type PushTarget,
} from '../src/pushNotifications';

// Notifications arriving while the app is open should still be seen. Set once, at module load,
// before any screen mounts.
configureNotificationHandler();

// Redirects between the auth screens (login/register) and the app depending on whether a token is
// held. Runs after the stored token has loaded, so a returning user is not flashed the login form.
// The social callback landings are here too: their return link arrives with no token held yet, and
// each must be allowed to adopt the one on the link rather than be bounced straight to /login.
const AUTH_ROUTES = [
  'login', 'email-login', 'register', 'forgot-password', 'reset-password',
  'facebook-auth', 'google-auth', 'apple-auth',
];

function RootNavigator() {
  const { token, loading, profileComplete } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Where a tapped notification wants to go, held until it is safe to go there. A tap that cold-
  // starts the app arrives before the session has loaded, and navigating then would race the gate
  // below -- which would bounce a signed-in driver to /login, or drop a signed-out one onto a stop
  // they cannot see. So the route waits for the session instead.
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  // Notification ids already routed, so the cold-start check and the live listener cannot both act
  // on the same tap.
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Nothing pushes to the web build, and its notifications shim has no responses to listen for.
    if (Platform.OS === 'web') return;

    const take = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      const route = routeForNotification(
        response.notification.request.content.data as PushTarget | undefined,
      );
      if (route) setPendingRoute(route);
    };

    // The tap that launched the app from cold. The listener below does not replay it.
    Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingRoute || loading) return;
    // Only once there is a session to show it to; otherwise the gate is about to send them to
    // /login anyway and the route would be thrown away mid-navigation.
    if (!token || profileComplete !== true) return;
    setPendingRoute(null);
    router.push(pendingRoute);
  }, [pendingRoute, loading, token, profileComplete]);

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = AUTH_ROUTES.includes(segments[0] as string);
    const onCompleteProfile = segments[0] === 'complete-profile';

    if (!token && !onAuthScreen) {
      router.replace('/login');
      return;
    }
    if (!token) return;

    // Signed in, but we do not yet know whether the sign-up details are owed: wait for the check
    // rather than flashing the home screen at someone who is about to be sent to the form.
    if (profileComplete === null) return;

    // A social sign-in mints the account from the provider's email and name alone, so the person
    // info and location steps still have to be collected before the app is usable.
    if (!profileComplete) {
      if (!onCompleteProfile) router.replace('/complete-profile');
    } else if (onAuthScreen || onCompleteProfile) {
      router.replace('/home');
    }
  }, [token, loading, profileComplete, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SessionLocationProvider>
        <CartProvider>
          <RootNavigator />
        </CartProvider>
        </SessionLocationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
