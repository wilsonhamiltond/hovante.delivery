// The notification router, tested per role: the bug being pinned here was a merchant tapping an
// order push and landing on /order/{id} -- the CUSTOMER tracking screen, which then says "pedido
// no encontrado" because that screen only loads the customer's own orders.
jest.mock('./api', () => ({
  cachedMe: jest.fn(),
  registerDevice: jest.fn(),
  unregisterDevice: jest.fn(),
}));

import * as api from './api';
import { routeForNotification, targetOfResponse } from './pushNotifications';

// A NotificationResponse as the two Android delivery paths actually shape it. Foreground
// notifications carry the payload in content.data; a TRAY tap (app backgrounded/killed) often
// carries content.data EMPTY with the payload on the trigger's FCM remoteMessage -- the case the
// old code dropped.
const response = (contentData: object, remoteData?: object) => ({
  notification: {
    request: {
      identifier: 'n1',
      content: { data: contentData },
      trigger: remoteData !== undefined ? { remoteMessage: { data: remoteData } } : null,
    },
  },
}) as never;

const signIn = (me: Partial<import('./api').Me> | null) =>
  (api.cachedMe as jest.Mock).mockReturnValue(me);

describe('routeForNotification', () => {
  describe('signed in as MERCHANT', () => {
    beforeEach(() => signIn({ isMerchant: true, isDriver: false, isClient: false }));

    it('opens "Nuevo pedido" (type order) on the merchant order screen', () => {
      expect(routeForNotification({ type: 'order', orderId: 'abc' }))
        .toBe('/merchant-order/abc');
    });

    it('opens even a customer-order push on the merchant screen (dual-role phone)', () => {
      // The same login placing a test order to its own store receives the customer status
      // pushes too; on the shop's phone those must not open the customer timeline.
      expect(routeForNotification({ type: 'customer-order', orderId: 'abc' }))
        .toBe('/merchant-order/abc');
    });
  });

  describe('signed in as CUSTOMER', () => {
    beforeEach(() => signIn({ isMerchant: false, isDriver: false, isClient: true }));

    it('opens their own order pushes on the tracking screen', () => {
      expect(routeForNotification({ type: 'customer-order', orderId: 'abc' }))
        .toBe('/order/abc');
    });
  });

  describe('signed in as DRIVER', () => {
    beforeEach(() => signIn({ isMerchant: false, isDriver: true, isClient: false }));

    it('opens a pool push on the claim screen', () => {
      expect(routeForNotification({ type: 'pool', deliveryId: 'd1' }))
        .toBe('/available/d1');
    });

    it('opens an assigned push on the stop itself', () => {
      expect(routeForNotification({ type: 'assigned', deliveryId: 'd1' }))
        .toBe('/delivery/d1');
    });
  });

  describe('no cached profile yet (cold start before me() resolves)', () => {
    beforeEach(() => signIn(null));

    it('still routes a merchant order push to the merchant screen', () => {
      expect(routeForNotification({ type: 'order', orderId: 'abc' }))
        .toBe('/merchant-order/abc');
    });
  });

  it('routes nothing when the payload carries nothing routable', () => {
    signIn({ isMerchant: true });
    expect(routeForNotification(undefined)).toBeNull();
    expect(routeForNotification({ type: 'order' })).toBeNull();
  });
});

describe('targetOfResponse (payload extraction)', () => {
  it('reads a foreground notification from content.data', () => {
    expect(targetOfResponse(response({ type: 'order', orderId: 'abc' })))
      .toEqual({ type: 'order', deliveryId: undefined, orderId: 'abc' });
  });

  it('falls back to the FCM remoteMessage on an Android tray tap with empty content.data', () => {
    expect(targetOfResponse(response({}, { type: 'order', orderId: 'abc' })))
      .toEqual({ type: 'order', deliveryId: undefined, orderId: 'abc' });
  });

  it('prefers content.data when both exist', () => {
    expect(targetOfResponse(response({ type: 'pool', deliveryId: 'd1' }, { type: 'order', orderId: 'x' })))
      .toEqual({ type: 'pool', deliveryId: 'd1', orderId: undefined });
  });

  it('returns undefined when neither location has anything', () => {
    expect(targetOfResponse(response({}))).toBeUndefined();
  });
});

describe('the whole chain: tray tap on a merchant phone', () => {
  it('a "Nuevo pedido" tray tap resolves to /merchant-order/{id}', () => {
    (api.cachedMe as jest.Mock).mockReturnValue({ isMerchant: true });
    // The exact shape the API publishes through SNS/FCM, delivered via the tray path.
    const tap = response({}, { type: 'order', orderId: 'ord-123' });
    expect(routeForNotification(targetOfResponse(tap))).toBe('/merchant-order/ord-123');
  });

  it('a customer-status tray tap on the merchant phone also resolves to the merchant screen', () => {
    (api.cachedMe as jest.Mock).mockReturnValue({ isMerchant: true });
    const tap = response({}, { type: 'customer-order', orderId: 'ord-123' });
    expect(routeForNotification(targetOfResponse(tap))).toBe('/merchant-order/ord-123');
  });
});
