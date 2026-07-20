import { Platform } from 'react-native';

// Where the hovante.api lives. On web (local testing) the browser reaches it at localhost. On a
// physical device, localhost is the phone itself -- point this at the dev machine's LAN IP, or wire
// it to Expo's debugger host, when we get to on-device testing.
const LOCAL_API = 'http://localhost:5179/api/v1';

export const API_BASE_URL = Platform.select({
  web: LOCAL_API,
  default: LOCAL_API,
}) as string;

// Google OAuth client ids for "Sign in with Google". Create these in Google Cloud Console
// (APIs & Services > Credentials) and fill each one in:
//   - webClientId:     an OAuth "Web application" client. Used on web AND as the audience the
//                      backend verifies against, so it must also be listed in the API's
//                      Google:ClientIds. Add the app's redirect URIs to this client.
//   - iosClientId:     an OAuth "iOS" client (bundle id = app.json ios.bundleIdentifier).
//   - androidClientId: an OAuth "Android" client (package name + SHA-1).
// Until these are set, the button renders but the Google flow cannot start (request stays null).
export const GOOGLE_CLIENT_IDS = {
  webClientId: 'REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com',
  iosClientId: 'REPLACE_WITH_YOUR_GOOGLE_IOS_CLIENT_ID.apps.googleusercontent.com',
  androidClientId: 'REPLACE_WITH_YOUR_GOOGLE_ANDROID_CLIENT_ID.apps.googleusercontent.com',
};

// True once the web client id has actually been filled in. The login screen uses this to decide
// whether to show the Google button, so a not-yet-configured build doesn't offer a dead action.
export const GOOGLE_ENABLED = !GOOGLE_CLIENT_IDS.webClientId.startsWith('REPLACE_WITH_');
