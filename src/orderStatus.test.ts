import { orderStatusChip } from './orderStatus';
import type { Order } from './api';

// The chip every customer-facing screen reads from. What is tested here is the precedence: which
// of several true things about an order gets to be the one sentence shown next to its number.
describe('orderStatusChip', () => {
  const confirmedAt = '2026-08-13T12:00:00.000Z';
  const at = (iso: string) => new Date(iso).getTime();
  // Only the fields the chip reads matter; the rest of an Order is noise here.
  const order = (o: Partial<Order>) => ({ status: 'PENDING', deliveryStatus: null, ...o }) as Order;

  it('says who is being waited on at each stage of the counter', () => {
    expect(orderStatusChip(order({ status: 'PENDING' })).label).toBe('Esperando al comercio');
    expect(orderStatusChip(order({ status: 'CONFIRMED' })).label).toBe('Confirmado');
    expect(orderStatusChip(order({ status: 'PREPARING' })).label).toBe('En preparación');
    // READY means the merchant is done and the order is waiting for a rider -- said from the
    // customer's side, that is "buscando repartidor", not "listo".
    expect(orderStatusChip(order({ status: 'READY' })).label).toBe('Buscando repartidor');
  });

  it('lets the street overtake the counter, which stalls at READY', () => {
    const o = order({ status: 'READY', deliveryStatus: 'IN_TRANSIT' });
    expect(orderStatusChip(o).label).toBe('En camino');
    expect(orderStatusChip(order({ status: 'READY', deliveryStatus: 'ASSIGNED' })).label).toBe('Repartidor asignado');
    expect(orderStatusChip(order({ status: 'READY', deliveryStatus: 'DELIVERED' })).label).toBe('Entregado');
  });

  it('shows the queue instead of a bare "Confirmado" while it runs', () => {
    const o = order({ status: 'CONFIRMED', queueMinutes: 15, confirmedAt });

    expect(orderStatusChip(o, at('2026-08-13T12:05:00.000Z')).label).toBe('En cola · ~10 min');
    // Once the wait runs out the queue stops speaking and the status underneath shows through.
    expect(orderStatusChip(o, at('2026-08-13T12:15:00.000Z')).label).toBe('Confirmado');
  });

  it('puts a driver ahead of a queue that has not been closed out', () => {
    const o = order({ status: 'CONFIRMED', queueMinutes: 60, confirmedAt, deliveryStatus: 'IN_TRANSIT' });
    expect(orderStatusChip(o, at('2026-08-13T12:05:00.000Z')).label).toBe('En camino');
  });

  it('lets a cancellation win over everything else the order still claims', () => {
    const o = order({ status: 'CANCELLED', deliveryStatus: 'IN_TRANSIT', queueMinutes: 15, confirmedAt });
    expect(orderStatusChip(o, at('2026-08-13T12:05:00.000Z')).label).toBe('Cancelado');
  });

  it('names a delivery that went wrong rather than leaving it in transit', () => {
    expect(orderStatusChip(order({ status: 'READY', deliveryStatus: 'FAILED' })).label).toBe('Entrega fallida');
    expect(orderStatusChip(order({ status: 'READY', deliveryStatus: 'RETURNED' })).label).toBe('Devuelto');
    expect(orderStatusChip(order({ status: 'READY', deliveryStatus: 'CANCELLED' })).label).toBe('Cancelado');
  });

  // A status the app has not been taught yet is shown as-is in grey: wrong-but-visible beats an
  // empty chip that reads as "no status".
  it('falls back to the raw status for anything unknown', () => {
    expect(orderStatusChip(order({ status: 'ON_HOLD' })).label).toBe('ON_HOLD');
  });
});
