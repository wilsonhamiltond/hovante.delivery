import { STEP_TITLES, stepsFor } from './checkoutSteps';

describe('checkout steps', () => {
  it('asks for the details before the map, so the mode is known first', () => {
    const steps = stepsFor('delivery');

    expect(steps).toEqual(['cart', 'details', 'location', 'note', 'summary']);
    expect(steps.indexOf('details')).toBeLessThan(steps.indexOf('location'));
  });

  // The whole point of moving details up: someone collecting at the counter has no delivery address
  // to give, so the map step should not exist for them at all.
  it('drops the location step on pickup', () => {
    const steps = stepsFor('pickup');

    expect(steps).toEqual(['cart', 'details', 'note', 'summary']);
    expect(steps).not.toContain('location');
  });

  // The stepper counts the sequence in force. A pickup order showing five dots would count down to
  // a step that never arrives.
  it('is four steps on pickup and five on delivery', () => {
    expect(stepsFor('pickup')).toHaveLength(4);
    expect(stepsFor('delivery')).toHaveLength(5);
  });

  it('has a title for every step either sequence can reach', () => {
    for (const key of [...stepsFor('delivery'), ...stepsFor('pickup')]) {
      expect(STEP_TITLES[key]).toBeTruthy();
    }
  });

  // Switching to pickup while standing on the details step must not strand the wizard: the steps
  // shared by both sequences have to keep their order, so an index taken in one is still sane in
  // the other up to the point they diverge.
  it('keeps the steps before the divergence in the same order', () => {
    const delivery = stepsFor('delivery');
    const pickup = stepsFor('pickup');

    expect(pickup.slice(0, 2)).toEqual(delivery.slice(0, 2));
  });
});
