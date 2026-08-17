import { routeForNotification } from './pushNotifications';

// Where a tapped notification lands. Each role's payload is shaped differently, and sending one to
// the wrong screen is silent -- the screen simply reports it cannot find the thing, because every
// one of these lists only what its own role may see.
describe('routeForNotification', () => {
  it('sends a merchant to the order that just landed', () => {
    expect(routeForNotification({ type: 'order', orderId: 'o1' })).toBe('/merchant-order/o1');
  });

  it('sends a pool offer to the claim screen, not the driver\'s own stop', () => {
    // /delivery/[id] reads the driver's OWN deliveries, and a pool order is not theirs yet.
    expect(routeForNotification({ type: 'pool', deliveryId: 'd1' })).toBe('/available/d1');
  });

  it('sends an assigned delivery to the stop itself', () => {
    expect(routeForNotification({ type: 'assigned', deliveryId: 'd1' })).toBe('/delivery/d1');
  });

  it('treats an unknown type carrying a delivery as assigned', () => {
    // Forward compatibility: a newer API adding a delivery-shaped type should still open something
    // rather than swallow the tap.
    expect(routeForNotification({ type: 'whatever', deliveryId: 'd1' })).toBe('/delivery/d1');
  });

  it('routes nothing when the payload carries no id', () => {
    expect(routeForNotification({ type: 'order' })).toBeNull();
    expect(routeForNotification({ type: 'pool' })).toBeNull();
    expect(routeForNotification({})).toBeNull();
    expect(routeForNotification(null)).toBeNull();
    expect(routeForNotification(undefined)).toBeNull();
  });

  it('does not mistake an order payload for a delivery', () => {
    // The merchant branch is checked first precisely so this cannot fall through to a
    // /delivery/undefined route.
    expect(routeForNotification({ type: 'order', orderId: 'o1', deliveryId: 'd1' }))
      .toBe('/merchant-order/o1');
  });
});
