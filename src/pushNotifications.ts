import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as api from './api';
import { strings, type Locale } from './i18n';

// The one user-visible string here: the Android channel's name, shown in the system's
// notification settings. Read at call time so re-registering under a new language renames it.
const S: Record<Locale, { channelName: string }> = {
  es: { channelName: 'Entregas' },
  en: { channelName: 'Deliveries' },
};

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
    name: strings(S).channelName,
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

/** How many notifications are sitting in the system tray right now (always 0 on web). */
export async function presentedNotificationCount(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    return (await Notifications.getPresentedNotificationsAsync()).length;
  } catch {
    return 0;
  }
}

/** "Marcar todo visto": clears every notification from the tray, and the app-icon badge with
 * them. The orders themselves are untouched -- this only tidies the tray. */
export async function clearAllNotifications() {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    if (__DEV__) console.warn('[push] no se pudieron limpiar las notificaciones', e);
  }
}

export interface PushTarget {
  /**
   * 'pool' -> an order anyone may claim; 'assigned' -> one already on this driver's route;
   * 'order' -> an order at the merchant's counter; 'customer-order' -> the customer's own order,
   * on any status change the API pushes about.
   */
  type?: string;
  deliveryId?: string;
  orderId?: string;
}

/**
 * The payload a tapped notification actually carries. A foreground notification puts it in
 * content.data -- but an Android TRAY notification (app backgrounded or killed) often arrives
 * with content.data EMPTY and the real payload riding on the FCM message inside the trigger.
 * Reading only content.data is why tapping "Nuevo pedido" from the tray opened the app on home
 * instead of the order; this reads both, preferring content.data when it has anything.
 */
export function targetOfResponse(response: Notifications.NotificationResponse): PushTarget | undefined {
  const request = response.notification.request;
  let data: Record<string, unknown> | undefined =
    request.content.data as Record<string, unknown> | undefined;
  if (!data || Object.keys(data).length === 0) {
    const trigger = request.trigger as { remoteMessage?: { data?: Record<string, unknown> } } | null;
    data = trigger?.remoteMessage?.data;
  }
  if (!data) return undefined;
  return {
    type: typeof data.type === 'string' ? data.type : undefined,
    deliveryId: typeof data.deliveryId === 'string' ? data.deliveryId : undefined,
    orderId: typeof data.orderId === 'string' ? data.orderId : undefined,
  };
}

/** The route a notification's payload points at, or null when it carries nothing routable. */
export function routeForNotification(data: PushTarget | null | undefined): string | null {
  // A MERCHANT account opens every order push on the counter's view, whatever the push type. The
  // same login can wear both hats -- a merchant placing a test order to their own store gets the
  // customer-facing "confirmado"/"en camino" pushes too, and routing those to the customer
  // timeline on the shop's phone is how "the notification opened order/ instead of
  // merchant-order/" happens. cachedMe is the signed-in role the tab bar already relies on.
  const isMerchant = api.cachedMe()?.isMerchant === true;
  if (isMerchant && data?.orderId
      && (data.type === 'order' || data.type === 'customer-order')) {
    return `/merchant-order/${data.orderId}`;
  }

  // The customer's own order: its tracking screen, which is the whole point of the notification --
  // "confirmado", "va en camino", "entregado" all want the same timeline.
  if (data?.type === 'customer-order' && data.orderId) return `/order/${data.orderId}`;

  // The merchant's counter. Checked before the delivery ids because it carries orderId rather than
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
