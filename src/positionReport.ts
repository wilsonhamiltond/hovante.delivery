import { useEffect, useRef } from 'react';
import * as api from './api';
import { distanceKm, type DevicePosition } from './position';

// Pushes the driver's position up to the API while they carry work, so the merchant's order view
// can show where the order actually is. Throttled -- a report only goes out when the driver has
// moved ~100 m or half a minute has passed -- and fire-and-forget: a lost report just means the
// next one carries the fresher fix. The server stamps it onto the driver's active deliveries and
// ignores it when they have none, so the hook can run on any driver screen without checks.

const MIN_MOVE_M = 100;
const MIN_INTERVAL_MS = 30000;

export function useDriverPositionReporter(driver: DevicePosition | null) {
  const last = useRef<{ at: DevicePosition; time: number } | null>(null);

  useEffect(() => {
    if (!driver) return;
    const now = Date.now();
    const prev = last.current;
    const movedM = prev ? distanceKm(prev.at, driver) * 1000 : Infinity;
    if (prev && movedM < MIN_MOVE_M && now - prev.time < MIN_INTERVAL_MS) return;
    last.current = { at: driver, time: now };
    void api.reportDriverPosition(driver.lat, driver.lng);
  }, [driver?.lat, driver?.lng]);
}
