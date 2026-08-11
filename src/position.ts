import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { LatLng } from './eta';

// Where the device is, for the screens that need the driver on a map or measured against a pool of
// work. The position is read here, in React Native, rather than by the map documents themselves:
// the app already holds the foreground permission and expo-location behaves the same on both
// platforms, whereas geolocation inside a WebView needs its own per-platform plumbing.

export interface DevicePosition extends LatLng {
  /** Radius in metres the fix is confident within, when the platform reports one. */
  accuracyM: number | null;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in kilometres. Straight-line rather than driving
 * distance: the callers use it to decide whether something is worth a network call, not to tell a
 * driver how far they will ride.
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// expo-location's web implementation passes this object straight to navigator.geolocation as its
// PositionOptions -- `accuracy` and `distanceInterval` mean nothing there, so the browser's own
// flags have to travel alongside them. Without enableHighAccuracy the browser answers from wifi/IP
// rather than GPS, which is a fix that can be a kilometre out, and its getCurrentPosition path
// defaults maximumAge to Infinity, letting it return a position cached from an earlier session.
// Native reads `accuracy` and ignores these, so the merged object is correct on both.
const webFlags = Platform.OS === 'web'
  ? { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  : {};

async function ensurePermission(): Promise<boolean> {
  // Same platform split as detectCurrentLocation in profileForm: on web the permission read never
  // prompts -- the browser asks when the position is actually requested -- so asking up front would
  // refuse before the browser ever had the chance to.
  if (Platform.OS === 'web') return true;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

// expo-location 19.0.8 tears its watch down through LocationEventEmitter.removeSubscription, which
// only exists on expo-modules-core's LegacyEventEmitter -- the emitter it actually holds is the
// modern one, with no such method. So the last unregister on a screen throws
// "removeSubscription is not a function", and unguarded that propagates out of the effect cleanup
// and breaks the navigation that triggered it.
//
// Safe to swallow: inside unregisterCallback the callback is deleted and removeWatchAsync has
// already run by the time the throwing line is reached, so the GPS is released either way. All that
// survives is the module-level event subscription, which the next watch reuses.
function stopWatching(subscription: Location.LocationSubscription | null) {
  if (!subscription) return;
  try {
    subscription.remove();
  } catch (e) {
    if (__DEV__) console.warn('[position] expo-location teardown threw; watch already released', e);
  }
}

function toPosition(p: Location.LocationObject): DevicePosition {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracyM: p.coords.accuracy ?? null,
  };
}

/** One fix, or null when the permission was refused or no fix could be taken. */
export async function currentPosition(): Promise<DevicePosition | null> {
  try {
    if (!await ensurePermission()) return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      ...webFlags,
    } as Location.LocationOptions);
    return toPosition(pos);
  } catch {
    return null;
  }
}

/**
 * The device position, kept current while the screen is mounted -- the driver's own dot on the
 * route map. Null until the first fix arrives, and forever when the permission is refused, so
 * callers render without it rather than block on it.
 */
export function useDriverPosition(): DevicePosition | null {
  const [position, setPosition] = useState<DevicePosition | null>(null);

  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      if (!await ensurePermission()) return;
      try {
        subscription = await Location.watchPositionAsync(
          {
            // Highest rather than High: this dot is what the driver navigates by, and the extra
            // battery is the point of a delivery app being open on a ride.
            accuracy: Location.Accuracy.Highest,
            // Native only -- the web implementation drops both. Fifteen metres is about a moto's
            // length of travel: often enough to track the road, sparse enough that a driver
            // standing at a door is not redrawing on GPS jitter.
            distanceInterval: 15,
            timeInterval: 5000,
            ...webFlags,
          } as Location.LocationOptions,
          (p) => { if (active) setPosition(toPosition(p)); },
          // No error handler on purpose. remove() unregisters the error subscriber only *after*
          // the location one, and the location one throws (see stopWatching) -- so registering
          // here would leak a live callback holding this component's setState on every teardown.
        );
      } catch {
        return; // No fix available: the map simply shows the two stops.
      }
      // The screen can be left while watchPositionAsync is still resolving; without this the
      // subscription would outlive it and keep the GPS awake.
      if (!active) { stopWatching(subscription); subscription = null; }
    })();

    return () => { active = false; stopWatching(subscription); };
  }, []);

  return position;
}

/**
 * The same position, but only republished once it has actually moved `minMoveM`. Routing and time
 * estimates are network calls per update; without this a driver waiting at a light would re-request
 * their whole leg every time the GPS twitched.
 */
export function useCoarsePosition(
  position: DevicePosition | null,
  minMoveM = 100,
): DevicePosition | null {
  const [coarse, setCoarse] = useState<DevicePosition | null>(null);

  useEffect(() => {
    if (!position) return;
    // Returning the previous object unchanged is what makes this a filter: React bails out of the
    // render, so nothing downstream sees an update it should have ignored.
    setCoarse((prev) => (
      prev && distanceKm(prev, position) * 1000 < minMoveM ? prev : position
    ));
  }, [position, minMoveM]);

  return coarse;
}
