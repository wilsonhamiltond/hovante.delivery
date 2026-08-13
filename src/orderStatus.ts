import type { Order } from './api';
import { queueRemainingMin } from './orderQueue';

// Where an order stands, as one label and colour, for every screen that shows one to a customer:
// the home carousel, the Explorar row, the orders list and the tracking screen. Written once
// because four copies of this drifted -- the list said "Confirmado" while the tracking screen
// said "En cola", for the same order at the same moment.
//
// The reading order matters. A terminal state wins over everything; then the street (a delivery
// that exists has overtaken the counter's status, which stalls at READY once released); then the
// queue, which is a clock rather than a stored status; and only then the order's own status.

export interface OrderStatusChip {
  label: string;
  color: string;
}

export function orderStatusChip(o: Order, now: number = Date.now()): OrderStatusChip {
  if (o.status === 'CANCELLED') return { label: 'Cancelado', color: '#dc2626' };

  switch (o.deliveryStatus) {
    case 'DELIVERED': return { label: 'Entregado', color: '#16a34a' };
    case 'IN_TRANSIT': return { label: 'En camino', color: '#0ea5e9' };
    case 'ASSIGNED': return { label: 'Repartidor asignado', color: '#2563eb' };
    case 'FAILED': return { label: 'Entrega fallida', color: '#dc2626' };
    case 'RETURNED': return { label: 'Devuelto', color: '#dc2626' };
    case 'CANCELLED': return { label: 'Cancelado', color: '#dc2626' };
  }

  // Still queueing: worth saying instead of "Confirmado", which leaves the customer wondering
  // whether anything is happening -- and it is the window in which they can still cancel.
  const queued = queueRemainingMin(o, now);
  if (queued != null && queued > 0) {
    return { label: `En cola · ~${queued} min`, color: '#7c3aed' };
  }

  switch (o.status) {
    case 'PENDING': return { label: 'Esperando al comercio', color: '#d97706' };
    case 'CONFIRMED': return { label: 'Confirmado', color: '#2563eb' };
    case 'PREPARING': return { label: 'En preparación', color: '#7c3aed' };
    case 'READY': return { label: 'Buscando repartidor', color: '#7c3aed' };
    case 'DELIVERED': return { label: 'Entregado', color: '#16a34a' };
  }
  return { label: o.status, color: '#64748b' };
}
