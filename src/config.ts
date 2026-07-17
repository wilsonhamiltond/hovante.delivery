import { Platform } from 'react-native';

// Where the hovante.api lives. On web (local testing) the browser reaches it at localhost. On a
// physical device, localhost is the phone itself -- point this at the dev machine's LAN IP, or wire
// it to Expo's debugger host, when we get to on-device testing.
const LOCAL_API = 'http://localhost:5179/api/v1';

export const API_BASE_URL = Platform.select({
  web: LOCAL_API,
  default: LOCAL_API,
}) as string;
