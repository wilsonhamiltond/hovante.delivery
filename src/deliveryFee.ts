// The delivery tariff: RD$30 flat, plus RD$20 for each of the first 2 km and RD$10 for every km
// after that. Kilometres are rounded to the nearest whole one first, so a 2.4 km trip bills 2 km
// and a 2.5 km one bills 3. A trip that rounds to 0 km still pays the flat fee.

export const DELIVERY_BASE_RD = 30;
export const DELIVERY_FIRST_KM_RD = 20;
export const DELIVERY_EXTRA_KM_RD = 10;
export const DELIVERY_FIRST_KM_COUNT = 2;

export function deliveryFeeRd(distanceM: number): number {
  const km = Math.round(distanceM / 1000);
  const firstKm = Math.min(km, DELIVERY_FIRST_KM_COUNT);
  const extraKm = Math.max(km - DELIVERY_FIRST_KM_COUNT, 0);
  return DELIVERY_BASE_RD + firstKm * DELIVERY_FIRST_KM_RD + extraKm * DELIVERY_EXTRA_KM_RD;
}
