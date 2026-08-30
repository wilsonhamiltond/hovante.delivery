import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/auth';
import { LocaleProvider } from '../src/i18n';
import { AuthPromptProvider } from '../src/AuthPrompt';
import { CartProvider } from '../src/cart';
import { SessionLocationProvider } from '../src/sessionLocation';
import * as api from '../src/api';
import {
  configureNotificationHandler, routeForNotification, targetOfResponse, type PushTarget,
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

// What a GUEST may see: the marketplace itself. App Review guideline 5.1.1 -- browsing is not an
// account-based feature, so it must not sit behind the login. Everything else (orders, addresses,
// account, checkout's final step) still requires signing in: navigating there without a token
// lands on /login below. The cart is browsable too -- it lives on the device; only PLACING the
// order is account-based, and the cart screen gates that step itself.
const GUEST_ROUTES = ['home', 'explore', 'cart'];

function RootNavigator() {
  const { token, loading, profileComplete } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Where a tapped notification wants to go, held as its PAYLOAD until it is safe to resolve. A
  // tap that cold-starts the app arrives before the session has loaded, and navigating then would
  // race the gate below. It is the payload and not the route because the route depends on the
  // signed-in ROLE (a merchant opens order pushes on the counter's view), and the role is not
  // known until the profile has been fetched -- resolving at tap time picked the customer screen
  // on every cold start.
  const [pendingTarget, setPendingTarget] = useState<PushTarget | null>(null);
  // Whether there is a navigator to push onto yet, and whether the app has landed on a real screen
  // rather than the bare "/" the root index redirects away from. Both have to be true before a
  // notification's route can be applied -- see the effect below.
  const rootNavigationState = useRootNavigationState();
  const navReady = !!rootNavigationState?.key;
  const landed = !!segments[0];
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
      // A tapped notification leaves the tray immediately -- Android does not always dismiss
      // tray notifications on tap by itself, and a handled one lingering there reads as unread.
      Notifications.dismissNotificationAsync(id).catch(() => {});
      // targetOfResponse, not content.data directly: an Android tray tap can carry the payload
      // on the trigger's FCM message instead of content.data, and reading only the latter is why
      // tapping "Nuevo pedido" from the tray opened the app on home instead of the order.
      const data = targetOfResponse(response);
      // Printed in development because this is otherwise invisible: a tap that carries an
      // unroutable payload, or one that arrives before the navigator, both look identical from the
      // outside -- the app opens on the home screen and nothing else happens.
      if (__DEV__) console.log('[push] tap', JSON.stringify(data ?? null));
      if (data && (data.orderId || data.deliveryId)) setPendingTarget(data);
    };

    // The tap that launched the app from cold. The listener below does not replay it.
    Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingTarget || loading) return;
    // Only once there is a session to show it to; otherwise the gate is about to send them to
    // /login anyway and the route would be thrown away mid-navigation.
    if (!token || profileComplete !== true) return;
    // ...and only once the navigator exists. A tap that cold-starts the app can resolve the
    // session before expo-router has mounted its root navigator, and a push made then is silently
    // DROPPED -- the app opens on the home screen as if the notification had carried nothing.
    // navReady is expo-router's own signal that there is something to navigate.
    if (!navReady) return;
    // The root index redirects "/" to /home declaratively; pushing before that has happened would
    // put the target underneath it and the redirect would replace it away.
    if (!landed) return;
    let active = true;
    (async () => {
      // The route depends on the role (merchant -> counter view), so make sure a profile has been
      // fetched before resolving -- on a cold start nothing else has asked for it yet.
      if (!api.cachedMe()) await api.me();
      if (!active) return;
      const route = routeForNotification(pendingTarget);
      if (__DEV__) console.log('[push] ruta', route ?? 'sin ruta');
      setPendingTarget(null);
      if (route) router.push(route);
    })();
    return () => { active = false; };
  }, [pendingTarget, loading, token, profileComplete, navReady, landed]);

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = AUTH_ROUTES.includes(segments[0] as string);
    const onCompleteProfile = segments[0] === 'complete-profile';
    // No segments yet is the root index, which immediately redirects to /home -- a guest route --
    // so it counts as one rather than flashing the login screen on the way there. Checked via the
    // first segment, not .length: expo-router types segments as a non-empty tuple, so a length
    // comparison with 0 is a type error even though the empty case is real at the root.
    const onGuestRoute = !segments[0] || GUEST_ROUTES.includes(segments[0] as string);

    if (!token && !onAuthScreen && !onGuestRoute) {
      router.replace('/login');
      return;
    }
    if (!token) return;

    // Signed in, but we do not yet know whether the sign-up details are owed: wait for the check
    // rather than flashing the home screen at someone who is about to be sent to the form.
    if (profileComplete === null) return;

    // A social sign-in mints the account from the provider's email and name alone, so the person
    // info and location steps are still owed -- but only where they are actually needed. Browsing
    // (the guest routes) stays open to an incomplete account: forcing the form before the
    // marketplace is the "registration before browsing" shape guideline 5.1.1 rejects. Landing on
    // the form right after sign-in is kept (an auth screen is not a guest route); the form offers
    // a way out to explore, and checkout sends them back when the details really are required.
    if (!profileComplete) {
      if (!onCompleteProfile && !onGuestRoute) router.replace('/complete-profile');
    } else if (onAuthScreen || onCompleteProfile) {
      router.replace('/home');
    }
  }, [token, loading, profileComplete, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
      <AuthProvider>
        <SessionLocationProvider>
        <CartProvider>
        <AuthPromptProvider>
          <RootNavigator />
        </AuthPromptProvider>
        </CartProvider>
        </SessionLocationProvider>
      </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
