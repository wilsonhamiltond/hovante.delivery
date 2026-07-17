import { Redirect } from 'expo-router';

// The gate in _layout handles the real redirects; this just sends the root path somewhere concrete
// so expo-router has an initial route. An unauthenticated user is bounced to /login from there.
export default function Index() {
  return <Redirect href="/home" />;
}
