import { driverNotices, merchantNotices, notices, unreadCount } from './notifications';
import type { Order } from './api';

// The inbox is a reading of the customer's orders, so what is tested here is that reading: one
// entry per order saying the latest thing that happened to it, newest first, and an id that only
// changes when the ORDER does.
describe('notices', () => {
  const at = (iso: string) => new Date(iso).getTime();
  const order = (o: Partial<Order>) => ({
    id: 'o1', orderNumber: 'PED-1', merchantName: 'Volao Test',
    status: 'PENDING', deliveryStatus: null,
    createdAt: '2026-08-13T12:00:00.000Z',
    ...o,
  }) as Order;

  it('says what happened, in the customer\'s terms', () => {
    const [n] = notices([order({ status: 'READY', deliveryStatus: 'IN_TRANSIT' })]);

    expect(n.title).toBe('PED-1 · En camino');
    expect(n.body).toBe('Volao Test — Tu pedido va en camino.');
  });

  it('reads a pickup order as ready to collect, not as waiting for a rider', () => {
    const [pickup] = notices([order({ status: 'READY', pickupAtStore: true })]);
    const [delivery] = notices([order({ status: 'READY' })]);

    expect(pickup.body).toContain('listo para recoger');
    expect(delivery.body).toContain('buscando repartidor');
  });

  it('puts the most recent first', () => {
    const list = notices([
      order({ id: 'old', createdAt: '2026-08-13T09:00:00.000Z' }),
      order({ id: 'new', createdAt: '2026-08-13T18:00:00.000Z' }),
      order({ id: 'mid', createdAt: '2026-08-13T12:00:00.000Z' }),
    ]);

    expect(list.map((n) => n.orderId)).toEqual(['new', 'mid', 'old']);
  });

  // The id is what "already seen" is remembered by, so it must be stable across a re-read of the
  // same state and different once the order moves on.
  it('keeps its id while the order stands still and changes when it advances', () => {
    const waiting = notices([order({ status: 'CONFIRMED' })])[0];
    const again = notices([order({ status: 'CONFIRMED' })])[0];
    const moved = notices([order({ status: 'CONFIRMED', deliveryStatus: 'ASSIGNED' })])[0];

    expect(again.id).toBe(waiting.id);
    expect(moved.id).not.toBe(waiting.id);
  });

  // A queued order's chip counts down every minute. If that text reached the id, the entry would
  // turn unread on every tick and the badge would never stay cleared.
  it('does not let the queue countdown make the same entry new again', () => {
    const queued = order({ status: 'CONFIRMED', queueMinutes: 15, confirmedAt: '2026-08-13T12:00:00.000Z' });

    const early = notices([queued], at('2026-08-13T12:01:00.000Z'))[0];
    const later = notices([queued], at('2026-08-13T12:09:00.000Z'))[0];

    expect(early.title).not.toBe(later.title); // the label does count down...
    expect(early.id).toBe(later.id); // ...but "seen" survives it
  });
});

describe('unreadCount', () => {
  const list = [
    { id: 'a', orderId: 'o1', title: '', body: '', color: '#000', at: '2026-08-13T12:00:00.000Z' },
    { id: 'b', orderId: 'o2', title: '', body: '', color: '#000', at: '2026-08-13T11:00:00.000Z' },
  ];

  it('counts what has not been seen', () => {
    expect(unreadCount(list, [])).toBe(2);
    expect(unreadCount(list, ['a'])).toBe(1);
    expect(unreadCount(list, ['a', 'b'])).toBe(0);
  });

  // Marks outlive the orders they belonged to; a stale one must not subtract from the count.
  it('ignores marks for entries that are no longer listed', () => {
    expect(unreadCount(list, ['gone', 'a'])).toBe(1);
  });
});

// The driver's and the merchant's readings of the same idea: one entry per thing in front of them,
// newest first, saying what it needs from them rather than what it is called.
describe('driverNotices', () => {
  const delivery = (o: Partial<import('./api').Delivery>) => ({
    id: 'd1', deliveryNumber: 'ENT-1', status: 'ASSIGNED',
    recipientName: 'Ana', scheduledDate: '2026-08-13T12:00:00.000Z',
    deliveredAt: null, failedAt: null, inTransitAt: null,
    ...o,
  }) as import('./api').Delivery;

  it('says what the stop needs from the driver', () => {
    const [n] = driverNotices([delivery({ status: 'IN_TRANSIT' })]);

    expect(n.title).toBe('ENT-1 · Ana');
    expect(n.body).toBe('Vas en camino al cliente.');
  });

  it('dates a finished delivery by when it finished, not when it was scheduled', () => {
    const list = driverNotices([
      delivery({ id: 'earlier', status: 'DELIVERED', deliveredAt: '2026-08-13T10:00:00.000Z' }),
      delivery({ id: 'later', status: 'DELIVERED', deliveredAt: '2026-08-13T16:00:00.000Z' }),
    ]);

    expect(list.map((n) => n.orderId)).toEqual(['later', 'earlier']);
  });
});

describe('merchantNotices', () => {
  const order = (o: Partial<Order>) => ({
    id: 'o1', orderNumber: 'PED-9', customerName: 'Ana', merchantName: 'Volao Test',
    status: 'PENDING', deliveryStatus: null, createdAt: '2026-08-13T12:00:00.000Z',
    ...o,
  }) as Order;

  // The counter's whole reason for a bell: an order it has not accepted yet.
  it('calls a new order what it is, and names the customer', () => {
    const [n] = merchantNotices([order({})]);

    expect(n.title).toBe('PED-9 · Ana');
    expect(n.body).toContain('Pedido nuevo');
  });

  it('follows the order onto the street', () => {
    expect(merchantNotices([order({ status: 'READY', deliveryStatus: 'ASSIGNED' })])[0].body)
      .toBe('Un repartidor viene a recogerlo.');
    expect(merchantNotices([order({ status: 'READY', deliveryStatus: 'IN_TRANSIT' })])[0].body)
      .toBe('El repartidor salió con el pedido.');
  });
});
