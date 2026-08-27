import { routeForNotification } from './pushNotifications';

// Where a tapped notification lands. Each role's payload is shaped differently, and sending one to
// the wrong screen is silent -- the screen simply reports it cannot find the thing, because every
// one of these lists only what its own role may see.
describe('routeForNotification', () => {
  it('sends a merchant to the order that just landed', () => {
    expect(routeForNotification({ type: 'order', orderId: 'o1' })).toBe('/merchant-order/o1');
  });

  // Every status change the API pushes about carries this type, so one route serves "confirmado",
  // "va en camino" and "entregado" alike -- they all want the same timeline.
  it('sends a customer to their order\'s tracking screen', () => {
    expect(routeForNotification({ type: 'customer-order', orderId: 'o1' })).toBe('/order/o1');
  });

  // The two order-shaped payloads must not be confused: the merchant's opens the counter's screen,
  // which a customer cannot read, and the customer's opens tracking, which shows a merchant nothing
  // they can act on.
  it('keeps the customer and merchant order payloads apart', () => {
    expect(routeForNotification({ type: 'customer-order', orderId: 'o1' })).toBe('/order/o1');
    expect(routeForNotification({ type: 'order', orderId: 'o1' })).toBe('/merchant-order/o1');
  });

  it('routes nothing for a customer payload with no order id', () => {
    expect(routeForNotification({ type: 'customer-order' })).toBeNull();
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
