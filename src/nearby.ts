import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as api from './api';
import type { Delivery } from './api';
import type { LatLng } from './eta';
import { currentPosition, distanceKm } from './position';

// How many of the pickup pool's deliveries are close enough to be worth a detour -- the number the
// driver home puts on its "Entregas disponibles" button.

// Five kilometres is roughly a ten-minute ride in the cities this app serves: near enough that a
// driver would take the job, wide enough that the badge is not empty most of the day.
export const NEARBY_RADIUS_KM = 5;

// How often the pool is refetched while the driver is looking at it. Focus-only was leaving a
// driver staring at "no hay entregas" while orders landed behind the screen -- the only way to see
// them was to navigate away and back. Fifteen seconds is short enough that the map feels live and
// long enough that an idle rider is not making 240 requests an hour.
//
// Polling, not a socket, because the API has no realtime transport at all today -- adding one is a
// server-side project, and this needs nothing. The push notification below is what makes it feel
// instant in the case that matters; the poll is the floor under it.
export const POOL_POLL_MS = 15000;

// The first place a driver actually rides to is the merchant, so distance is measured to the pickup
// when it has been geocoded, and to the drop-off otherwise. A delivery with neither pin cannot be
// placed and so never counts as near. Exported so the home's pool map places its pins by the same
// rule this count filters by.
export function originOf(d: Delivery): LatLng | null {
  if (d.pickupLatitude != null && d.pickupLongitude != null) {
    return { lat: d.pickupLatitude, lng: d.pickupLongitude };
  }
  if (d.latitude != null && d.longitude != null) {
    return { lat: d.latitude, lng: d.longitude };
  }
  return null;
}

export interface NearbyAvailable {
  count: number;
  /** False when the device position is unknown and the count is the whole pool instead. */
  filtered: boolean;
  /** The whole pickup pool, so the home can draw every available delivery on its map. */
  pool: Delivery[];
  /** Refetch right now, for a caller that has just been told the pool changed. */
  refresh: () => void;
}

export function useNearbyAvailable(): NearbyAvailable {
  const [pool, setPool] = useState<Delivery[]>([]);
  const [origin, setOrigin] = useState<LatLng | null>(null);

  // The fix is taken once per mount and reused. The badge only needs to know roughly where the
  // driver is, and re-reading GPS on every focus would spend battery on a number that barely moves.
  useEffect(() => {
    let active = true;
    currentPosition().then((p) => { if (active) setOrigin(p); });
    return () => { active = false; };
  }, []);

  // Tracked in a ref rather than a local so `load` can be handed out as `refresh` and still know
  // whether the screen is still up when its reply lands.
  const focused = useRef(false);

  const load = useCallback(async () => {
    const res = await api.availableDeliveries();
    if (focused.current && res.success) setPool(res.data ?? []);
  }, []);

  // The pool changes as other drivers claim from it and as merchants release new orders, so it is
  // refetched on focus AND on a timer while focused. The interval is cleared on blur: a driver with
  // the app in their pocket should not be polling.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void load();
    const id = setInterval(() => { void load(); }, POOL_POLL_MS);
    return () => { focused.current = false; clearInterval(id); };
  }, [load]));

  return useMemo(() => {
    // No fix (denied, or still resolving): the whole pool is the honest answer. Better a count that
    // is too broad than a badge that hides work the driver could take.
    if (!origin) return { count: pool.length, filtered: false, pool, refresh: load };
    const near = pool.filter((d) => {
      const o = originOf(d);
      return o != null && distanceKm(origin, o) <= NEARBY_RADIUS_KM;
    });
    return { count: near.length, filtered: true, pool, refresh: load };
  }, [pool, origin, load]);
}
