import { useEffect, useState } from 'react';

// Driving estimate between two stops (office -> order), from the same public OSRM router the
// route map draws its street line with -- so the number the driver reads matches the line they
// see, and it needs no Google API or key. Null whenever OSRM cannot answer; callers simply hide
// the estimate rather than show a wrong one.

export interface RouteEstimate {
  durationSec: number;
  distanceM: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export async function estimateRoute(from: LatLng, to: LatLng): Promise<RouteEstimate | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/`
      + `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (typeof route?.duration !== 'number' || typeof route?.distance !== 'number') return null;
    return { durationSec: route.duration, distanceM: route.distance };
  } catch {
    return null;
  }
}

// "≈ 18 min · 6.4 km". Never shows "0 min": anything under a minute rounds up to one, so a
// half-block delivery still reads as a time rather than an error.
export function formatEta(e: RouteEstimate): string {
  const minutes = Math.max(1, Math.round(e.durationSec / 60));
  const time = minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;
  const km = e.distanceM / 1000;
  const distance = km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
  return `≈ ${time} · ${distance}`;
}

// The estimate for a pair of possibly-missing coordinates: resolves once per stop change and
// stays null while loading, when either stop has no pin, or when OSRM is unreachable.
export function useRouteEta(
  fromLat: number | null | undefined, fromLng: number | null | undefined,
  toLat: number | null | undefined, toLng: number | null | undefined,
): RouteEstimate | null {
  const [eta, setEta] = useState<RouteEstimate | null>(null);
  useEffect(() => {
    setEta(null);
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) return;
    let active = true;
    estimateRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng })
      .then((e) => { if (active) setEta(e); });
    return () => { active = false; };
  }, [fromLat, fromLng, toLat, toLng]);
  return eta;
}
