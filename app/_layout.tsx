import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth';
import { CartProvider } from '../src/cart';

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
        <CartProvider>
          <RootNavigator />
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
