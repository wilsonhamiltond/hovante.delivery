import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as api from './api';
import { getToken } from './storage';
import { distanceKm } from './position';

// The online driver's heartbeat, foreground and background. The server only counts a driver as
// available while their phone keeps beating (see DriverPresence on the API): a phone that dies or
// loses signal simply goes quiet, and after heartbeatTimeoutMinutes it stops counting.
//
// In the background the beat rides on an OS location task, so a driver can lock the screen or
// switch apps and stay online. It needs the "always" location permission; without it the driver can
// still go online, but only stays so while Volao is open (the foreground timer in driverPresence).

export const DRIVER_LOCATION_TASK = 'volao-driver-location';

// At most one beat per this interval unless the driver moved -- the OS task and the foreground timer
// both call beat(), and between them they must not double the traffic. Under the foreground timer's
// 60 s so the timer's own beats always pass.
const MIN_INTERVAL_MS = 50000;
const MIN_MOVE_M = 100;

let last: { lat: number; lng: number; time: number } | null = null;

export type TrackingMode = 'background' | 'foreground-only';

/**
 * Sends one heartbeat, throttled. Resolves to the server's presence answer, or null when it was
 * throttled or could not be sent (a lost beat is fine -- the next one carries a fresher fix).
 */
export async function beat(lat: number, lng: number, force = false): Promise<api.DriverPresence | null> {
  const now = Date.now();
  if (!force && last) {
    const movedM = distanceKm(last, { lat, lng }) * 1000;
    if (movedM < MIN_MOVE_M && now - last.time < MIN_INTERVAL_MS) return null;
  }
  last = { lat, lng, time: now };
  const res = await api.driverHeartbeat(lat, lng);
  return res.success ? res.data : null;
}

/** Forgets the throttle, so the next beat goes out immediately (a new shift, a new session). */
export function resetBeat() {
  last = null;
}

// Defined at module load, as expo-task-manager requires: when the OS wakes the app for a location
// update the task must already be registered before any screen mounts -- or with no screen at all.
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
      if (error) return;
      const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
      const latest = locations?.[locations.length - 1];
      if (!latest) return;

      // Woken in the background, the app may not have started -- and so nothing has loaded the
      // session token yet. No stored session means nobody to beat for: stop for good.
      if (!api.hasAuthToken()) {
        const stored = await getToken().catch(() => null);
        if (!stored) { await stopBackgroundTracking(); return; }
        api.setAuthToken(stored);
      }

      const presence = await beat(latest.coords.latitude, latest.coords.longitude);
      // The shift ended elsewhere -- the driver went offline on another device, or the server
      // timed them out. Reporting on would only drain the battery of someone no longer working.
      if (presence && !presence.isOnline && presence.offlineReason != null) {
        await stopBackgroundTracking();
      }
    });
  } catch (e) {
    if (__DEV__) console.warn('[presence] background task unavailable', e);
  }
}

/**
 * Starts background reporting. Resolves to how the driver will be tracked: in the background, or
 * only while the app is open.
 *
 * `prompt` asks for the "always" permission if it is missing -- only when the driver taps "Ponerme
 * en línea". Re-checks (the app coming back to the foreground) must not: on Android asking again
 * sends the driver to the system settings, and doing that on every return to the app would be a
 * loop they could never get out of.
 */
export async function startBackgroundTracking(prompt = false): Promise<TrackingMode> {
  if (Platform.OS === 'web') return 'foreground-only';
  try {
    const fg = prompt
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'foreground-only';
    const bg = prompt
      ? await Location.requestBackgroundPermissionsAsync()
      : await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return 'foreground-only';

    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) return 'background';
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      // Time-based, not distance-based: a driver waiting outside a restaurant is not moving, and
      // their beat must keep coming all the same. distanceInterval 0 is what lets a stationary
      // phone keep reporting; the beat() throttle keeps the network side to one call a minute.
      timeInterval: 60000,
      distanceInterval: 0,
      // iOS: keep updates flowing while parked, and show the blue status-bar pill so the driver can
      // always see that Volao is using their location.
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.OtherNavigation,
      showsBackgroundLocationIndicator: true,
      // Android: background location runs inside a foreground service, which must show a
      // notification for as long as it runs -- here it doubles as the "you are online" reminder.
      foregroundService: {
        notificationTitle: 'Volao · En línea',
        notificationBody: 'Compartiendo tu ubicación para recibir pedidos cercanos.',
        notificationColor: '#1d4ed8',
      },
    });
    return 'background';
  } catch (e) {
    // Expo Go, a device with location services off, an OS that refused the service: the driver
    // can still work with the app open.
    if (__DEV__) console.warn('[presence] could not start background location', e);
    return 'foreground-only';
  }
}

/** Whether the "always" location permission is already granted -- decides if the prominent
 * disclosure has to be shown before going online (Google Play's background-location policy). */
export async function hasBackgroundPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // Not started, or already torn down -- either way nothing is reporting.
  }
}

/**
 * Sign-out: stop reporting and end the shift. Best-effort and called while the token is still set;
 * the server also ends the shift on the unregister call and, failing both, on the heartbeat timeout.
 */
export async function endDriverShift(): Promise<void> {
  await stopBackgroundTracking();
  resetBeat();
  if (api.cachedMe()?.isDriver) {
    await api.setDriverPresence(false).catch(() => null);
  }
}
