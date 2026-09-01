// The checkout wizard's shape. Lives apart from the screen because it is a decision, not a layout:
// which steps an order goes through depends on how it leaves the store, and that is worth being
// able to state -- and test -- on its own.

import { strings, type Locale } from './i18n';

export type StepKey = 'cart' | 'details' | 'location' | 'note' | 'summary';

export type DeliveryMode = 'delivery' | 'pickup';

const S: Record<Locale, Record<StepKey, string>> = {
  es: {
    cart: 'Carrito',
    details: 'Detalles',
    location: 'Ubicación',
    note: 'Nota',
    summary: 'Resumen',
  },
  en: {
    cart: 'Cart',
    details: 'Details',
    location: 'Location',
    note: 'Note',
    summary: 'Summary',
  },
  fr: {
    cart: 'Panier',
    details: 'Détails',
    location: 'Emplacement',
    note: 'Note',
    summary: 'Récapitulatif',
  },
};

export const STEP_TITLES: Record<StepKey, string> = S.es;

// Locale-aware titles; called at render time so a language switch shows on the next pass.
export function stepTitles(): Record<StepKey, string> {
  return strings(S);
}

// Details come before the location so the mode is known before the map. Only a delivery has
// somewhere to be delivered to, so pickup drops the location step and runs in four: making someone
// collecting at the counter pin a delivery address asks for something the order never uses.
export function stepsFor(mode: DeliveryMode): StepKey[] {
  return mode === 'delivery'
    ? ['cart', 'details', 'location', 'note', 'summary']
    : ['cart', 'details', 'note', 'summary'];
}
