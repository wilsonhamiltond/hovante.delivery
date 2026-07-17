import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth';

// Redirects between the auth screens (login/register) and the app depending on whether a token is
// held. Runs after the stored token has loaded, so a returning user is not flashed the login form.
const AUTH_ROUTES = ['login', 'register'];

function RootNavigator() {
  const { token, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = AUTH_ROUTES.includes(segments[0] as string);
    if (!token && !onAuthScreen) {
      router.replace('/login');
    } else if (token && onAuthScreen) {
      router.replace('/home');
    }
  }, [token, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
