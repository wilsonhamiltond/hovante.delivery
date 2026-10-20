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

// Volao Mandao's own wizard: what to do, where to go, where to bring it, review. Fixed length --
// every errand has both ends, so nothing drops out the way pickup drops the location step.
export type MandaoStepKey = 'need' | 'pickup' | 'dropoff' | 'summary';

export const MANDAO_STEPS: MandaoStepKey[] = ['need', 'pickup', 'dropoff', 'summary'];

const M: Record<Locale, Record<MandaoStepKey, string>> = {
  es: { need: 'Qué necesitas', pickup: 'A dónde ir', dropoff: 'A dónde traerlo', summary: 'Resumen' },
  en: { need: 'What you need', pickup: 'Where to go', dropoff: 'Where to bring it', summary: 'Summary' },
  fr: { need: 'Votre besoin', pickup: 'Où aller', dropoff: 'Où l’apporter', summary: 'Récapitulatif' },
};

export function mandaoStepTitles(): Record<MandaoStepKey, string> {
  return strings(M);
}

// Volao Viaje's wizard: where we collect you, where you are going, how you pay and what the
// driver should know, review. No "what you need" step -- the customer is the cargo.
export type RideStepKey = 'pickup' | 'destination' | 'details' | 'summary';

export const RIDE_STEPS: RideStepKey[] = ['pickup', 'destination', 'details', 'summary'];

const R: Record<Locale, Record<RideStepKey, string>> = {
  es: { pickup: 'Dónde estás', destination: 'A dónde vas', details: 'Detalles', summary: 'Resumen' },
  en: { pickup: 'Where you are', destination: 'Where to', details: 'Details', summary: 'Summary' },
  fr: { pickup: 'Où vous êtes', destination: 'Où aller', details: 'Détails', summary: 'Récapitulatif' },
};

export function rideStepTitles(): Record<RideStepKey, string> {
  return strings(R);
}

// Details come before the location so the mode is known before the map. Only a delivery has
// somewhere to be delivered to, so pickup drops the location step and runs in four: making someone
// collecting at the counter pin a delivery address asks for something the order never uses.
export function stepsFor(mode: DeliveryMode): StepKey[] {
  return mode === 'delivery'
    ? ['cart', 'details', 'location', 'note', 'summary']
    : ['cart', 'details', 'note', 'summary'];
}
