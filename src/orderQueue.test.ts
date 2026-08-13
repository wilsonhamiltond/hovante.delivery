import { queueRemainingMin } from './orderQueue';

// The derived queue phase: a confirmed order with a declared wait is EN COLA until confirmedAt +
// queueMinutes, and due for preparation after. Times are fixed, not Date.now(), so the boundary
// cases are exact.
describe('queueRemainingMin', () => {
  const confirmedAt = '2026-08-13T12:00:00.000Z';
  const at = (iso: string) => new Date(iso).getTime();

  it('counts down while the declared wait runs', () => {
    const o = { status: 'CONFIRMED', queueMinutes: 15, confirmedAt };

    expect(queueRemainingMin(o, at('2026-08-13T12:00:00.000Z'))).toBe(15);
    expect(queueRemainingMin(o, at('2026-08-13T12:10:00.000Z'))).toBe(5);
    // Mid-minute rounds UP: with 4½ minutes left, "5 min" is a promise still kept, "4" is not.
    expect(queueRemainingMin(o, at('2026-08-13T12:10:30.000Z'))).toBe(5);
  });

  it('reaches 0 when the wait has run out, and stays there', () => {
    const o = { status: 'CONFIRMED', queueMinutes: 15, confirmedAt };

    expect(queueRemainingMin(o, at('2026-08-13T12:15:00.000Z'))).toBe(0);
    expect(queueRemainingMin(o, at('2026-08-13T13:00:00.000Z'))).toBe(0);
  });

  // "Ahora" (0 minutes) is a real answer: the order was never queued, preparation was due at once.
  it('treats a zero-minute wait as immediately due', () => {
    expect(queueRemainingMin({ status: 'CONFIRMED', queueMinutes: 0, confirmedAt }, at(confirmedAt))).toBe(0);
  });

  it('does not apply without a declared wait, a confirm stamp, or the CONFIRMED status', () => {
    const now = at('2026-08-13T12:05:00.000Z');

    expect(queueRemainingMin({ status: 'CONFIRMED', queueMinutes: null, confirmedAt }, now)).toBeNull();
    expect(queueRemainingMin({ status: 'CONFIRMED', queueMinutes: 15, confirmedAt: null }, now)).toBeNull();
    // Once READY (or anything later), the wait it described is over regardless of the clock.
    expect(queueRemainingMin({ status: 'READY', queueMinutes: 15, confirmedAt }, now)).toBeNull();
    expect(queueRemainingMin({ status: 'PENDING', queueMinutes: 15, confirmedAt }, now)).toBeNull();
  });

  it('refuses an unparseable confirm stamp rather than deriving from NaN', () => {
    expect(queueRemainingMin({ status: 'CONFIRMED', queueMinutes: 15, confirmedAt: 'not-a-date' })).toBeNull();
  });
});
