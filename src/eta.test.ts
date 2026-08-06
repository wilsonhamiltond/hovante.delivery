import { formatEta } from './eta';

describe('formatEta', () => {
  it('formats minutes and short distances', () => {
    expect(formatEta({ durationSec: 18 * 60, distanceM: 6400 })).toBe('≈ 18 min · 6.4 km');
  });

  it('never shows zero minutes', () => {
    expect(formatEta({ durationSec: 20, distanceM: 200 })).toBe('≈ 1 min · 0.2 km');
  });

  it('switches to hours past sixty minutes', () => {
    expect(formatEta({ durationSec: 75 * 60, distanceM: 52000 })).toBe('≈ 1 h 15 min · 52 km');
  });

  it('drops decimals on long distances', () => {
    expect(formatEta({ durationSec: 30 * 60, distanceM: 12345 })).toBe('≈ 30 min · 12 km');
  });
});
