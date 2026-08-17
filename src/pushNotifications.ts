import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as api from './api';

// Push notifications for drivers: the app hands its NATIVE device token to the API, and the API
// pushes through Amazon SNS mobile push when there is work worth waking someone for.
//
// Native, not Expo: SNS delivers to FCM and APNs directly and cannot route an Expo token, so this
// uses getDevicePushTokenAsync -- an FCM registration token on Android, an APNs token on iOS. The
// platform travels with it because it decides which SNS platform application the token belongs to.
//
// WHERE THIS DOES NOTHING, deliberately and silently:
//   - web, which has no native push here;
//   - simulators/emulators, which cannot be issued a token at all;
//   - Expo Go, which is not a build registered with FCM/APNs under our own credentials -- on
//     Android remote push is gone entirely from SDK 53, and neither platform can produce a device
//     token we could hand to SNS (https://docs.expo.dev/versions/v54.0.0/sdk/notifications/).
// Each of those is a normal way to run this app during development, so none of them may throw or
// nag. The driver simply gets no notifications until the build supports them.

// storeClient is Expo Go, as opposed to a development or release build of this app.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const pushSupported = Platform.OS !== 'web' && Device.isDevice && !isExpoGo;

/** Why push is off, for the log line. Null when it is on. */
function unsupportedReason(): string | null {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'simulador';
  if (isExpoGo) return 'Expo Go (requiere development build con credenciales FCM/APNs)';
  return null;
}

// A notification arriving while the app is open should still be seen: a driver reading one order's
// detail is exactly who needs to know another just landed.
export function configureNotificationHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      // shouldShowAlert is deprecated in this version; banner + list replace it.
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Android needs a channel before anything can arrive with sound and heads-up priority. Created
// under the id the API sends as channelId.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Entregas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1d4ed8',
  });
}

/**
 * Asks for permission, gets the Expo token and registers it against the signed-in account.
 * Returns the token so sign-out can hand back the same one. Null whenever push is unavailable or
 * refused -- all of which are ordinary, not errors.
 */
export async function registerForPush(): Promise<string | null> {
  const reason = unsupportedReason();
  if (reason) {
    if (__DEV__) console.log(`[push] desactivado: ${reason}`);
    return null;
  }

  try {
    await ensureAndroidChannel();

    // Only ask if we do not already hold it: requesting on every launch is how an app gets its
    // permission dialog dismissed for good.
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return null;

    // The native token SNS needs. `type` comes back as 'android' | 'ios' and is what tells the API
    // which platform application to create the endpoint in, so it is sent rather than Platform.OS.
    const device = await Notifications.getDevicePushTokenAsync();
    const token = typeof device?.data === 'string' ? device.data : null;
    if (!token) return null;

    const res = await api.registerDevice(token, device.type ?? Platform.OS);
    // A token the server never took is not a token we can later unregister, so report failure.
    return res.success ? token : null;
  } catch (e) {
    if (__DEV__) console.warn('[push] no se pudo registrar', e);
    return null;
  }
}

/** Stops pushes to this handset. Called on sign-out so a shared phone does not keep the last driver's work. */
export async function unregisterFromPush(token: string | null) {
  if (!token) return;
  try {
    await api.unregisterDevice(token);
  } catch (e) {
    if (__DEV__) console.warn('[push] no se pudo dar de baja', e);
  }
}

export interface PushTarget {
  /**
   * 'pool' -> an order anyone may claim; 'assigned' -> one already on this driver's route;
   * 'order' -> a new order at the merchant's counter.
   */
  type?: string;
  deliveryId?: string;
  orderId?: string;
}

/** The route a notification's payload points at, or null when it carries nothing routable. */
export function routeForNotification(data: PushTarget | null | undefined): string | null {
  // The merchant's new-order notification. Checked first because it carries orderId rather than
  // deliveryId -- an order's delivery exists from creation but is parked in AWAITING_MERCHANT, so
  // there is nothing about it a shop could act on yet.
  if (data?.type === 'order' && data.orderId) return `/merchant-order/${data.orderId}`;

  if (!data?.deliveryId) return null;
  // A pool order is not the driver's yet, so it opens the claim screen; an assigned one opens the
  // stop itself. Sending a pool order to /delivery/[id] would show "Entrega no encontrada", since
  // that screen reads the driver's OWN list.
  return data.type === 'pool'
    ? `/available/${data.deliveryId}`
    : `/delivery/${data.deliveryId}`;
}
