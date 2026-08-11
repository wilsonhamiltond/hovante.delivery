import { deliveryFeeRd } from './deliveryFee';

describe('deliveryFeeRd', () => {
  it('bills in started half-kilometres', () => {
    expect(deliveryFeeRd(300)).toBe(40);    // 0.3 -> 0.5 km: 30 + 10
    expect(deliveryFeeRd(600)).toBe(50);    // 0.6 -> 1.0 km: 30 + 20
    expect(deliveryFeeRd(1100)).toBe(60);   // 1.1 -> 1.5 km: 30 + 30
  });

  it('charges RD$10 per half km across the first two km', () => {
    expect(deliveryFeeRd(1000)).toBe(50);   // exactly 1 km: 30 + 20
    expect(deliveryFeeRd(2000)).toBe(70);   // exactly 2 km: 30 + 40
  });

  it('charges RD$5 per started half km after the first two', () => {
    expect(deliveryFeeRd(2100)).toBe(75);   // 2.1 -> 2.5 km: 30 + 40 + 5
    expect(deliveryFeeRd(3000)).toBe(80);   // 3.0 km: 30 + 40 + 10
    expect(deliveryFeeRd(7900)).toBe(130);  // 7.9 -> 8.0 km: 30 + 40 + 12 halves x 5
  });

  it('charges nothing extra for a zero-distance trip', () => {
    expect(deliveryFeeRd(0)).toBe(30);      // flat fee only
  });
});
