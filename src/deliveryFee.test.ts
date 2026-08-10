import { deliveryFeeRd } from './deliveryFee';

describe('deliveryFeeRd', () => {
  it('charges only the flat fee when the trip rounds to zero km', () => {
    expect(deliveryFeeRd(400)).toBe(30);
  });

  it('charges RD$20 per km inside the first two', () => {
    expect(deliveryFeeRd(1000)).toBe(50);   // 1 km
    expect(deliveryFeeRd(2000)).toBe(70);   // 2 km
  });

  it('charges RD$10 per km after the first two', () => {
    expect(deliveryFeeRd(3000)).toBe(80);   // 30 + 40 + 10
    expect(deliveryFeeRd(7900)).toBe(130);  // rounds to 8 km: 30 + 40 + 60
  });

  it('rounds the kilometres before pricing', () => {
    expect(deliveryFeeRd(2400)).toBe(70);   // 2.4 -> 2 km
    expect(deliveryFeeRd(2500)).toBe(80);   // 2.5 -> 3 km
  });
});
