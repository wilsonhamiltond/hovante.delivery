import { deliveryFeeRd } from './deliveryFee';

describe('deliveryFeeRd', () => {
  it('bills in started half-kilometres', () => {
    expect(deliveryFeeRd(300)).toBe(60);    // 0.3 -> 0.5 km: 50 + 10
    expect(deliveryFeeRd(600)).toBe(70);    // 0.6 -> 1.0 km: 50 + 20
    expect(deliveryFeeRd(1100)).toBe(80);   // 1.1 -> 1.5 km: 50 + 30
  });

  it('charges RD$10 per half km (RD$20/km) across the first five km', () => {
    expect(deliveryFeeRd(1000)).toBe(70);   // exactly 1 km: 50 + 20
    expect(deliveryFeeRd(2000)).toBe(90);   // exactly 2 km: 50 + 40
    expect(deliveryFeeRd(3000)).toBe(110);  // exactly 3 km: 50 + 60
    expect(deliveryFeeRd(5000)).toBe(150);  // exactly 5 km: 50 + 100
  });

  it('charges RD$5 per started half km after the first five', () => {
    expect(deliveryFeeRd(5100)).toBe(155);  // 5.1 -> 5.5 km: 50 + 100 + 5
    expect(deliveryFeeRd(6000)).toBe(160);  // 6.0 km: 50 + 100 + 10
    expect(deliveryFeeRd(7900)).toBe(180);  // 7.9 -> 8.0 km: 50 + 100 + 6 halves x 5
  });

  it('charges nothing extra for a zero-distance trip', () => {
    expect(deliveryFeeRd(0)).toBe(50);      // flat fee only
  });
});
