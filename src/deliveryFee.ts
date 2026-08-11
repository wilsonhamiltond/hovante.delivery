// The delivery tariff: RD$30 flat; RD$10 per half kilometre across the first 2 km; RD$5 per half
// kilometre past that. Distance is billed in STARTED half-kilometres -- 0.3 km bills as 0.5,
// 0.6 as 1.0, 1.1 as 1.5 -- so a started half is always a charged half. Billing only: the
// distance the customer reads on screen stays the exact route distance.

export const DELIVERY_BASE_RD = 30;
/** RD$ per started half km inside the first stretch. */
export const DELIVERY_FIRST_HALF_KM_RD = 10;
/** RD$ per started half km after the first stretch. */
export const DELIVERY_EXTRA_HALF_KM_RD = 5;
/** How many km the first stretch covers. */
export const DELIVERY_FIRST_KM_COUNT = 2;

export function deliveryFeeRd(distanceM: number): number {
  // Started half-kilometres, the tariff's billing unit.
  const halves = Math.ceil(distanceM / 500);
  const firstHalves = Math.min(halves, DELIVERY_FIRST_KM_COUNT * 2);
  const extraHalves = Math.max(halves - DELIVERY_FIRST_KM_COUNT * 2, 0);
  return DELIVERY_BASE_RD
    + firstHalves * DELIVERY_FIRST_HALF_KM_RD
    + extraHalves * DELIVERY_EXTRA_HALF_KM_RD;
}
