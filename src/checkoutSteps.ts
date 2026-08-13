// The checkout wizard's shape. Lives apart from the screen because it is a decision, not a layout:
// which steps an order goes through depends on how it leaves the store, and that is worth being
// able to state -- and test -- on its own.

export type StepKey = 'cart' | 'details' | 'location' | 'note' | 'summary';

export type DeliveryMode = 'delivery' | 'pickup';

export const STEP_TITLES: Record<StepKey, string> = {
  cart: 'Carrito',
  details: 'Detalles',
  location: 'Ubicación',
  note: 'Nota',
  summary: 'Resumen',
};

// Details come before the location so the mode is known before the map. Only a delivery has
// somewhere to be delivered to, so pickup drops the location step and runs in four: making someone
// collecting at the counter pin a delivery address asks for something the order never uses.
export function stepsFor(mode: DeliveryMode): StepKey[] {
  return mode === 'delivery'
    ? ['cart', 'details', 'location', 'note', 'summary']
    : ['cart', 'details', 'note', 'summary'];
}
