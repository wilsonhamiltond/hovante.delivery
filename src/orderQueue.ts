// The queue phase of a confirmed order. When the merchant declared a wait at confirm ("empezamos
// en 15 min"), the order passes through EN COLA before EN PREPARACIÓN -- but that passage is a
// clock running out, not a transition anybody records. So it is derived here from what the server
// does record (queueMinutes + confirmedAt), and every screen reading it stays consistent.
//
// Deliberately NOT derived server-side: the web back office keys its actions off the stored
// status (CONFIRMED), and a status that changed by itself on read would take those buttons away.

export interface QueuedOrder {
  status: string;
  queueMinutes?: number | null;
  confirmedAt?: string | null;
}

// How many minutes remain before the counter starts on the order: >0 while it queues, 0 once the
// declared wait has run out (preparation is due), and null when the question does not apply --
// not confirmed yet, no wait declared, or already past CONFIRMED.
export function queueRemainingMin(o: QueuedOrder, now: number = Date.now()): number | null {
  if (o.status !== 'CONFIRMED') return null;
  if (o.queueMinutes == null || o.confirmedAt == null) return null;
  const startsAt = new Date(o.confirmedAt).getTime() + o.queueMinutes * 60_000;
  if (!Number.isFinite(startsAt)) return null;
  return Math.max(0, Math.ceil((startsAt - now) / 60_000));
}
