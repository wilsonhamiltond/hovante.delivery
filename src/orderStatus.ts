import type { Order } from './api';
import { queueRemainingMin } from './orderQueue';
import { strings, type Locale } from './i18n';

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

const S: Record<
  Locale,
  {
    cancelled: string;
    delivered: string;
    inTransit: string;
    assigned: string;
    failed: string;
    returned: string;
    queued: (min: number) => string;
    pending: string;
    confirmed: string;
    preparing: string;
    readyForPickup: string;
    findingDriver: string;
  }
> = {
  es: {
    cancelled: 'Cancelado',
    delivered: 'Entregado',
    inTransit: 'En camino',
    assigned: 'Repartidor asignado',
    failed: 'Entrega fallida',
    returned: 'Devuelto',
    queued: (min) => `En cola · ~${min} min`,
    pending: 'Esperando al comercio',
    confirmed: 'Confirmado',
    preparing: 'En preparación',
    readyForPickup: 'Listo para recoger',
    findingDriver: 'Buscando repartidor',
  },
  en: {
    cancelled: 'Cancelled',
    delivered: 'Delivered',
    inTransit: 'On the way',
    assigned: 'Driver assigned',
    failed: 'Delivery failed',
    returned: 'Returned',
    queued: (min) => `In queue · ~${min} min`,
    pending: 'Waiting for the merchant',
    confirmed: 'Confirmed',
    preparing: 'Being prepared',
    readyForPickup: 'Ready for pickup',
    findingDriver: 'Finding a driver',
  },
  fr: {
    cancelled: 'Annulée',
    delivered: 'Livrée',
    inTransit: 'En route',
    assigned: 'Livreur assigné',
    failed: 'Livraison échouée',
    returned: 'Retournée',
    queued: (min) => `En file d’attente · ~${min} min`,
    pending: 'En attente du commerce',
    confirmed: 'Confirmée',
    preparing: 'En préparation',
    readyForPickup: 'Prête à retirer',
    findingDriver: 'Recherche d’un livreur',
  },
};

export function orderStatusChip(o: Order, now: number = Date.now()): OrderStatusChip {
  const tx = strings(S);
  if (o.status === 'CANCELLED') return { label: tx.cancelled, color: '#dc2626' };

  switch (o.deliveryStatus) {
    case 'DELIVERED': return { label: tx.delivered, color: '#16a34a' };
    case 'IN_TRANSIT': return { label: tx.inTransit, color: '#0ea5e9' };
    case 'ASSIGNED': return { label: tx.assigned, color: '#2563eb' };
    case 'FAILED': return { label: tx.failed, color: '#dc2626' };
    case 'RETURNED': return { label: tx.returned, color: '#dc2626' };
    case 'CANCELLED': return { label: tx.cancelled, color: '#dc2626' };
  }

  // Still queueing: worth saying instead of "Confirmado", which leaves the customer wondering
  // whether anything is happening -- and it is the window in which they can still cancel.
  const queued = queueRemainingMin(o, now);
  if (queued != null && queued > 0) {
    return { label: tx.queued(queued), color: '#7c3aed' };
  }

  switch (o.status) {
    case 'PENDING': return { label: tx.pending, color: '#d97706' };
    case 'CONFIRMED': return { label: tx.confirmed, color: '#2563eb' };
    case 'PREPARING': return { label: tx.preparing, color: '#7c3aed' };
    // On a retiro en tienda nobody is searched for: the order waits for its OWN customer.
    case 'READY': return o.pickupAtStore
      ? { label: tx.readyForPickup, color: '#16a34a' }
      : { label: tx.findingDriver, color: '#7c3aed' };
    case 'DELIVERED': return { label: tx.delivered, color: '#16a34a' };
  }
  return { label: o.status, color: '#64748b' };
}
