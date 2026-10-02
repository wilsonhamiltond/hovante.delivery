import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from '../src/keyboard';
import { TextInput } from '../src/TextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import { useAuthPrompt } from '../src/AuthPrompt';
import * as api from '../src/api';
import { formatEta, useRouteEta } from '../src/eta';
import { MANDAO_MAX_BUDGET_RD, MANDAO_SURCHARGE_RD, mandaoFeeRd } from '../src/deliveryFee';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import { detectCurrentLocation } from '../src/profileForm';
import { sessionLocationLabel, useSessionLocation } from '../src/sessionLocation';
import { MANDAO_STEPS, mandaoStepTitles, type MandaoStepKey } from '../src/checkoutSteps';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { KeyboardCloseButton } from '../src/KeyboardCloseButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const money = (n: number) => `RD$${n.toFixed(2)}`;

// The longest description the server keeps.
const DESCRIPTION_MAX = 1000;

type Point = { lat: number | null; lng: number | null };

const S: Record<
  Locale,
  {
    brand: string;
    tagline: string;
    intro: string;
    howItWorks: string[];
    needLabel: string;
    needPlaceholder: string;
    examplesLabel: string;
    examples: string[];
    budgetLabel: string;
    budgetHint: (max: string) => string;
    budgetPlaceholder: string;
    budgetTooHigh: (max: string) => string;
    continueLabel: string;
    pickupHint: string;
    noDrivers: string;
    noDriversFleet: string;
    checkingDrivers: string;
    dropoffHint: string;
    myLocation: string;
    pickupAddress: string;
    pickupReference: string;
    pickupReferencePlaceholder: string;
    dropoffAddress: string;
    locPermTitle: string;
    locPermBody: string;
    locTitle: string;
    locFailed: string;
    whatLabel: string;
    goToLabel: string;
    bringToLabel: string;
    etaLabel: (eta: string) => string;
    costsLabel: string;
    serviceFee: (eta: string) => string;
    serviceFeeIncludes: (surcharge: string) => string;
    feePending: string;
    purchasesLabel: string;
    purchasesUpTo: (budget: string) => string;
    purchasesNone: string;
    purchasesNote: string;
    paymentLabel: string;
    cashNote: string;
    payWithLabel: string;
    payWithPlaceholder: (total: string) => string;
    payWithError: (total: string) => string;
    changeDue: (amount: string) => string;
    submit: string;
    failedTitle: string;
    total: string;
    totalUpTo: string;
  }
> = {
  es: {
    brand: 'Volao Mandao',
    tagline: '¿Necesitas algo? Volao te lo busca.',
    intro: 'Un conductor va a donde le digas, busca, compra o hace la diligencia por ti y te lo trae a tu puerta.',
    howItWorks: [
      'Cuéntanos qué necesitas',
      'Marca a dónde debe ir el conductor',
      'Marca a dónde traértelo',
      'Pagas en efectivo al recibirlo: el envío más lo que el conductor gastó',
    ],
    needLabel: '¿Qué necesitas?',
    needPlaceholder: 'Ej: Busca en la farmacia las medicinas de la receta y tráemelas. Si no tienen la de 500 mg, la de 250 mg está bien.',
    examplesLabel: 'Ideas',
    examples: [
      'Comprar medicinas en la farmacia',
      'Recoger un paquete',
      'Pagar una factura',
      'Buscar algo que olvidé',
      'Hacer una compra en el colmado',
    ],
    budgetLabel: '¿Cuánto puede gastar el conductor? (opcional)',
    budgetHint: (max) => `Si hay que comprar algo, el conductor lo paga y tú se lo devuelves al recibirlo. Máximo ${max}.`,
    budgetPlaceholder: 'Ej: 800 · vacío si no hay que comprar nada',
    budgetTooHigh: (max) => `El presupuesto máximo es ${max}.`,
    continueLabel: 'Continuar',
    pickupHint: 'Toca el mapa donde debe ir el conductor',
    noDrivers: 'No hay repartidores disponibles cerca de ese punto en este momento. Prueba otra ubicación o intenta más tarde.',
    noDriversFleet: 'No hay repartidores disponibles para ese punto en este momento.',
    checkingDrivers: 'Buscando repartidores disponibles…',
    dropoffHint: 'Toca el mapa donde debemos llevarlo',
    myLocation: '📍 Mi ubicación',
    pickupAddress: 'Dirección a donde ir',
    pickupReference: 'Referencia (opcional)',
    pickupReferencePlaceholder: 'Ej: frente al colmado, segundo piso, preguntar por Juan…',
    dropoffAddress: 'Dirección de entrega',
    locPermTitle: 'Permiso de ubicación',
    locPermBody: 'Activa el permiso de ubicación para usar tu ubicación actual.',
    locTitle: 'Ubicación',
    locFailed: 'No se pudo obtener tu ubicación actual.',
    whatLabel: 'Tu mandado',
    goToLabel: 'El conductor va a',
    bringToLabel: 'Y te lo trae a',
    etaLabel: (eta) => `⏱️ ${eta} de un punto al otro`,
    costsLabel: 'Costos',
    serviceFee: (eta) => `Servicio Volao Mandao · ${eta}`,
    serviceFeeIncludes: (surcharge) => `Incluye el recorrido y ${surcharge} por el tiempo del conductor`,
    feePending: 'Se calcula al conocer la distancia',
    purchasesLabel: 'Compras del conductor',
    purchasesUpTo: (budget) => `Hasta ${budget}`,
    purchasesNone: 'Nada que comprar',
    purchasesNote: 'Pagas solo lo que el conductor realmente gaste.',
    paymentLabel: 'Pago',
    cashNote: '💵 Efectivo, al recibir tu mandado',
    payWithLabel: '¿Con cuánto vas a pagar?',
    payWithPlaceholder: (total) => `Ej: 2000 · hasta ${total} · vacío si pagas exacto`,
    payWithError: (total) => `Debe cubrir el envío y el presupuesto (${total}).`,
    changeDue: (amount) => `Devuelta estimada: ${amount}`,
    submit: 'Pedir Volao Mandao',
    failedTitle: 'No se pudo pedir el Volao Mandao',
    total: 'Total',
    totalUpTo: 'Total (hasta)',
  },
  en: {
    brand: 'Volao Mandao',
    tagline: 'Need something? Volao gets it for you.',
    intro: 'A driver goes wherever you say, finds, buys or runs the errand for you and brings it to your door.',
    howItWorks: [
      'Tell us what you need',
      'Mark where the driver should go',
      'Mark where to bring it',
      'Pay cash when you receive it: the fee plus what the driver spent',
    ],
    needLabel: 'What do you need?',
    needPlaceholder: 'E.g.: Get the medicines on the prescription at the pharmacy. If they are out of the 500 mg, the 250 mg is fine.',
    examplesLabel: 'Ideas',
    examples: [
      'Buy medicine at the pharmacy',
      'Pick up a package',
      'Pay a bill',
      'Fetch something I forgot',
      'Shop at the corner store',
    ],
    budgetLabel: 'How much can the driver spend? (optional)',
    budgetHint: (max) => `If something must be bought, the driver pays and you pay them back on delivery. Maximum ${max}.`,
    budgetPlaceholder: 'E.g.: 800 · leave empty if nothing needs buying',
    budgetTooHigh: (max) => `The maximum budget is ${max}.`,
    continueLabel: 'Continue',
    pickupHint: 'Tap the map where the driver should go',
    noDrivers: 'No drivers are available near that point right now. Try another location or check back later.',
    noDriversFleet: 'No drivers are available for that point right now.',
    checkingDrivers: 'Looking for available drivers…',
    dropoffHint: 'Tap the map where we should bring it',
    myLocation: '📍 My location',
    pickupAddress: 'Address to go to',
    pickupReference: 'Landmark (optional)',
    pickupReferencePlaceholder: 'E.g.: across from the store, second floor, ask for Juan…',
    dropoffAddress: 'Delivery address',
    locPermTitle: 'Location permission',
    locPermBody: 'Enable the location permission to use your current location.',
    locTitle: 'Location',
    locFailed: 'Could not get your current location.',
    whatLabel: 'Your errand',
    goToLabel: 'The driver goes to',
    bringToLabel: 'And brings it to',
    etaLabel: (eta) => `⏱️ ${eta} from one point to the other`,
    costsLabel: 'Costs',
    serviceFee: (eta) => `Volao Mandao service · ${eta}`,
    serviceFeeIncludes: (surcharge) => `Includes the ride and ${surcharge} for the driver's time`,
    feePending: 'Calculated once the distance is known',
    purchasesLabel: 'Driver purchases',
    purchasesUpTo: (budget) => `Up to ${budget}`,
    purchasesNone: 'Nothing to buy',
    purchasesNote: 'You only pay what the driver actually spends.',
    paymentLabel: 'Payment',
    cashNote: '💵 Cash, when you receive your errand',
    payWithLabel: 'How much will you pay with?',
    payWithPlaceholder: (total) => `E.g.: 2000 · up to ${total} · leave empty for exact payment`,
    payWithError: (total) => `It must cover the fee and the budget (${total}).`,
    changeDue: (amount) => `Estimated change: ${amount}`,
    submit: 'Request Volao Mandao',
    failedTitle: 'The Volao Mandao could not be requested',
    total: 'Total',
    totalUpTo: 'Total (up to)',
  },
  fr: {
    brand: 'Volao Mandao',
    tagline: 'Besoin de quelque chose ? Volao s’en charge.',
    intro: 'Un chauffeur va où vous le dites, cherche, achète ou fait la course pour vous et vous l’apporte.',
    howItWorks: [
      'Dites-nous ce dont vous avez besoin',
      'Indiquez où le chauffeur doit aller',
      'Indiquez où vous l’apporter',
      'Payez en espèces à la réception : les frais plus ce que le chauffeur a dépensé',
    ],
    needLabel: 'De quoi avez-vous besoin ?',
    needPlaceholder: 'Ex. : Prenez à la pharmacie les médicaments de l’ordonnance. S’il n’y a pas le 500 mg, le 250 mg convient.',
    examplesLabel: 'Idées',
    examples: [
      'Acheter des médicaments',
      'Récupérer un colis',
      'Payer une facture',
      'Aller chercher un oubli',
      'Faire des courses à l’épicerie',
    ],
    budgetLabel: 'Combien le chauffeur peut-il dépenser ? (facultatif)',
    budgetHint: (max) => `S’il faut acheter quelque chose, le chauffeur paie et vous le remboursez à la livraison. Maximum ${max}.`,
    budgetPlaceholder: 'Ex. : 800 · vide s’il n’y a rien à acheter',
    budgetTooHigh: (max) => `Le budget maximum est de ${max}.`,
    continueLabel: 'Continuer',
    pickupHint: 'Touchez la carte là où le chauffeur doit aller',
    noDrivers: 'Aucun livreur n’est disponible près de ce point pour le moment. Essayez un autre lieu ou revenez plus tard.',
    noDriversFleet: 'Aucun livreur n’est disponible pour ce point pour le moment.',
    checkingDrivers: 'Recherche de livreurs disponibles…',
    dropoffHint: 'Touchez la carte là où nous devons l’apporter',
    myLocation: '📍 Ma position',
    pickupAddress: 'Adresse où aller',
    pickupReference: 'Repère (facultatif)',
    pickupReferencePlaceholder: 'Ex. : en face de l’épicerie, deuxième étage, demander Juan…',
    dropoffAddress: 'Adresse de livraison',
    locPermTitle: 'Autorisation de localisation',
    locPermBody: 'Activez l’autorisation de localisation pour utiliser votre position actuelle.',
    locTitle: 'Localisation',
    locFailed: 'Impossible d’obtenir votre position actuelle.',
    whatLabel: 'Votre course',
    goToLabel: 'Le chauffeur va à',
    bringToLabel: 'Et l’apporte à',
    etaLabel: (eta) => `⏱️ ${eta} d’un point à l’autre`,
    costsLabel: 'Coûts',
    serviceFee: (eta) => `Service Volao Mandao · ${eta}`,
    serviceFeeIncludes: (surcharge) => `Comprend le trajet et ${surcharge} pour le temps du chauffeur`,
    feePending: 'Calculés une fois la distance connue',
    purchasesLabel: 'Achats du chauffeur',
    purchasesUpTo: (budget) => `Jusqu’à ${budget}`,
    purchasesNone: 'Rien à acheter',
    purchasesNote: 'Vous ne payez que ce que le chauffeur dépense réellement.',
    paymentLabel: 'Paiement',
    cashNote: '💵 Espèces, à la réception de votre course',
    payWithLabel: 'Avec combien allez-vous payer ?',
    payWithPlaceholder: (total) => `Ex. : 2000 · jusqu’à ${total} · vide si montant exact`,
    payWithError: (total) => `Le montant doit couvrir les frais et le budget (${total}).`,
    changeDue: (amount) => `Monnaie estimée : ${amount}`,
    submit: 'Demander Volao Mandao',
    failedTitle: 'Le Volao Mandao n’a pas pu être demandé',
    total: 'Total',
    totalUpTo: 'Total (jusqu’à)',
  },
};

// "Volao Mandao": the customer asks a driver to go somewhere and find, buy or do something for
// them. Four steps -- what, where to go, where to bring it, review -- then straight to the same
// tracking screen every order uses. There is no merchant to confirm it: the server drops it into
// the driver pool the moment it is placed.
export default function MandaoScreen() {
  const router = useRouter();
  const { token, profileComplete } = useAuth();
  const { promptLogin } = useAuthPrompt();
  const session = useSessionLocation();
  const tx = useStrings(S);

  const [stepKey, setStepKey] = useState<MandaoStepKey>('need');
  const [description, setDescription] = useState('');
  // Kept as text while typing; empty means nothing to buy.
  const [budget, setBudget] = useState('');

  const [pickup, setPickup] = useState<Point>({ lat: null, lng: null });
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupReference, setPickupReference] = useState('');
  const [pickupMapKey, setPickupMapKey] = useState(0);

  const [dropoff, setDropoff] = useState<Point>({ lat: null, lng: null });
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLabel, setDropoffLabel] = useState<string | null>(null);
  const [dropoffMapKey, setDropoffMapKey] = useState(0);

  const [payWith, setPayWith] = useState('');
  const [locating, setLocating] = useState(false);
  // Whether anyone can actually take an errand starting at the chosen pickup pin. The server
  // refuses the Mandao outright when nobody can, so the pickup step asks first -- being turned
  // away after writing the errand and picking both pins is the version worth avoiding.
  const [drivers, setDrivers] = useState<api.DriverAvailability | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  // Where it is brought defaults to where the customer is, exactly like checkout: the session pin
  // chosen from the home header first, then the saved default address.
  useEffect(() => {
    if (session.location) {
      setDropoffAddress(session.location.address);
      setDropoffLabel(sessionLocationLabel());
      setDropoff({ lat: session.location.latitude, lng: session.location.longitude });
      if (session.location.latitude != null) setDropoffMapKey((k) => k + 1);
      return;
    }
    if (!token) return;
    api.me().then((res) => {
      if (!res.success || !res.data) return;
      setDropoffAddress(res.data.address ?? '');
      setDropoffLabel(res.data.addressLabel ?? null);
      setDropoff({ lat: res.data.latitude ?? null, lng: res.data.longitude ?? null });
      if (res.data.latitude != null && res.data.longitude != null) setDropoffMapKey((k) => k + 1);
    });
  }, []);

  // Ask whether anyone can take it whenever the pickup pin moves. Debounced: dragging across the
  // map settles on a pin rather than firing a request per frame. The answer is advisory here --
  // the server makes the real decision when the Mandao is placed -- so a failed check leaves the
  // step usable rather than stranding the customer behind a network error.
  useEffect(() => {
    if (pickup.lat == null || pickup.lng == null) { setDrivers(null); return; }
    const lat = pickup.lat;
    const lng = pickup.lng;
    let alive = true;
    setCheckingDrivers(true);
    const timer = setTimeout(() => {
      api.driverAvailability(null, lat, lng)
        .then((res) => { if (alive) setDrivers(res.success ? (res.data ?? null) : null); })
        .finally(() => { if (alive) setCheckingDrivers(false); });
    }, 500);
    return () => { alive = false; clearTimeout(timer); setCheckingDrivers(false); };
  }, [pickup.lat, pickup.lng]);

  // Only a definite "nobody" blocks: a check that failed or has not answered yet leaves the
  // button alone, because the server will refuse it anyway if it really is empty.
  const noDrivers = drivers != null && !drivers.available;

  // The ride the fee is billed on: pickup -> door. Null while either pin is missing or the
  // router cannot answer, in which case the review says the fee is still to be calculated.
  const eta = useRouteEta(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const fee = eta ? mandaoFeeRd(eta.distanceM) : null;

  const budgetNum = budget.trim() === '' ? null : Number(budget.trim());
  const budgetValid = budgetNum == null || (Number.isFinite(budgetNum) && budgetNum >= 0 && budgetNum <= MANDAO_MAX_BUDGET_RD);
  const budgetAmount = budgetValid && budgetNum != null && budgetNum > 0 ? budgetNum : 0;

  // The most the customer can owe: the fee plus everything the driver may spend. What they
  // actually pay is the fee plus what was really spent, declared by the driver at the door.
  const maxTotal = (fee ?? 0) + budgetAmount;
  const payWithNum = payWith.trim() === '' ? null : Number(payWith.trim());
  const payWithValid = payWithNum == null || (Number.isFinite(payWithNum) && payWithNum >= maxTotal);
  const changeDue = payWithNum != null && payWithValid ? payWithNum - maxTotal : null;

  const stepIndex = Math.max(0, MANDAO_STEPS.indexOf(stepKey));
  const goNext = () => {
    // Asking is account-based, like ordering: a guest is asked to sign in before going further,
    // and an account that skipped the profile form is sent back to it -- the driver needs a phone.
    if (!token && stepKey === 'need') { promptLogin(); return; }
    if (token && profileComplete === false && stepKey === 'need') { router.push('/complete-profile'); return; }
    Keyboard.dismiss();
    setStepKey(MANDAO_STEPS[Math.min(MANDAO_STEPS.length - 1, stepIndex + 1)]);
  };
  const goBack = () => setStepKey(MANDAO_STEPS[Math.max(0, stepIndex - 1)]);

  const useMyLocation = async (target: 'pickup' | 'dropoff') => {
    setLocating(true);
    const result = await detectCurrentLocation();
    setLocating(false);
    if (!result.ok) {
      if (result.reason === 'permission') Alert.alert(tx.locPermTitle, tx.locPermBody);
      else Alert.alert(tx.locTitle, tx.locFailed);
      return;
    }
    const point = { lat: result.location.lat, lng: result.location.lng };
    if (target === 'pickup') {
      setPickup(point);
      setPickupMapKey((k) => k + 1);
      if (result.location.address) setPickupAddress(result.location.address);
    } else {
      setDropoff(point);
      setDropoffLabel(null);
      setDropoffMapKey((k) => k + 1);
      if (result.location.address) setDropoffAddress(result.location.address);
    }
  };

  const submit = async () => {
    if (pickup.lat == null || pickup.lng == null) return;
    setSubmitting(true);
    const res = await api.createMandao({
      description: description.trim(),
      pickupAddress: pickupAddress.trim() || undefined,
      pickupLatitude: pickup.lat,
      pickupLongitude: pickup.lng,
      pickupReference: pickupReference.trim() || undefined,
      address: dropoffAddress.trim() || undefined,
      latitude: dropoff.lat,
      longitude: dropoff.lng,
      budget: budgetAmount > 0 ? budgetAmount : undefined,
      // The measured route; the server rebuilds the fee from it with its own tariff.
      deliveryDistanceM: eta ? Math.round(eta.distanceM) : undefined,
      cashPayWith: payWithNum != null && payWithValid && payWithNum > 0 ? payWithNum : undefined,
    });
    setSubmitting(false);
    if (!res.success) { Alert.alert(tx.failedTitle, res.message); return; }
    // The same tracking screen as any order: status, driver, code, chat.
    router.replace(`/order/${res.data.id}`);
  };

  const pickupOrigin = pickup.lat != null && pickup.lng != null
    ? { lat: pickup.lat, lng: pickup.lng, title: pickupAddress || tx.goToLabel }
    : null;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={() => (stepIndex === 0
            ? (router.canGoBack() ? router.back() : router.replace('/home'))
            : goBack())} />
          <Text style={styles.title}>{stepIndex === 0 ? tx.brand : mandaoStepTitles()[stepKey]}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>
        <Stepper current={stepIndex} />

        {/* Step 1 -- the errand, in the customer's own words. The intro explains the service the
            first time anyone opens it; the idea chips start a description rather than replace one. */}
        {stepKey === 'need' && (
          <>
            <KeyboardAwareScrollView contentContainerStyle={styles.scroll}>
              <View style={styles.hero}>
                <Text style={styles.heroEmoji}>🛵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{tx.tagline}</Text>
                  <Text style={styles.heroText}>{tx.intro}</Text>
                </View>
              </View>
              <View style={styles.howCard}>
                {tx.howItWorks.map((line, i) => (
                  <View key={line} style={styles.howRow}>
                    <View style={styles.howNum}><Text style={styles.howNumText}>{i + 1}</Text></View>
                    <Text style={styles.howText}>{line}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.labelRow}>
                <Text style={[styles.labelText, { flex: 1 }]}>{tx.needLabel}</Text>
                <KeyboardCloseButton visible={focused === 'description'} />
              </View>
              <TextInput
                style={styles.description}
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, DESCRIPTION_MAX))}
                placeholder={tx.needPlaceholder}
                placeholderTextColor={t.textFaint}
                multiline
                onFocus={() => setFocused('description')}
                onBlur={() => setFocused(null)}
              />
              <Text style={styles.counter}>{description.length}/{DESCRIPTION_MAX}</Text>

              <Text style={styles.label}>{tx.examplesLabel}</Text>
              <View style={styles.chips}>
                {tx.examples.map((ex) => (
                  <Pressable
                    key={ex}
                    style={styles.chip}
                    onPress={() => setDescription((d) => (d.trim() ? `${d.trim()}\n${ex}: ` : `${ex}: `))}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText}>{ex}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>{tx.budgetLabel}</Text>
              <TextInput
                style={styles.input}
                value={budget}
                onChangeText={setBudget}
                placeholder={tx.budgetPlaceholder}
                placeholderTextColor={t.textFaint}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {budgetValid
                ? <Text style={styles.hintSmall}>{tx.budgetHint(money(MANDAO_MAX_BUDGET_RD))}</Text>
                : <Text style={styles.error}>{tx.budgetTooHigh(money(MANDAO_MAX_BUDGET_RD))}</Text>}
            </KeyboardAwareScrollView>
            <View style={styles.footer}>
              <Pressable
                style={[styles.primary, (!description.trim() || !budgetValid) && styles.disabled]}
                disabled={!description.trim() || !budgetValid}
                onPress={goNext}
              >
                <Text style={styles.primaryText}>{tx.continueLabel}</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Step 2 -- where the driver goes. Opens on the drop-off (usually the customer's own
            area) until a pin is placed, since an errand rarely starts across the country. */}
        {stepKey === 'pickup' && (
          <KeyboardAvoidingView style={styles.mapStep}>
            <View style={styles.locRow}>
              <Text style={styles.hint}>{tx.pickupHint}</Text>
              <Pressable style={styles.locBtn} onPress={() => useMyLocation('pickup')} disabled={locating}>
                {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>{tx.myLocation}</Text>}
              </Pressable>
            </View>
            <LocationPicker
              key={`pickup-${pickupMapKey}`}
              latitude={pickup.lat ?? dropoff.lat ?? DEFAULT_CENTER.lat}
              longitude={pickup.lng ?? dropoff.lng ?? DEFAULT_CENTER.lng}
              onPick={(loc) => {
                setPickup({ lat: loc.lat, lng: loc.lng });
                if (loc.address) setPickupAddress(loc.address);
              }}
            />
            <View style={styles.labelRow}>
              <Text style={[styles.labelText, { flex: 1 }]}>{tx.pickupAddress}</Text>
              <KeyboardCloseButton visible={focused === 'pickupAddress' || focused === 'pickupReference'} />
            </View>
            <TextInput style={styles.addressInput} value={pickupAddress} onChangeText={setPickupAddress}
              placeholder={tx.pickupAddress} placeholderTextColor={t.textFaint} multiline
              onFocus={() => setFocused('pickupAddress')} onBlur={() => setFocused(null)} />
            <TextInput style={[styles.input, { marginTop: 8 }]} value={pickupReference} onChangeText={setPickupReference}
              placeholder={tx.pickupReferencePlaceholder} placeholderTextColor={t.textFaint}
              accessibilityLabel={tx.pickupReference}
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
              onFocus={() => setFocused('pickupReference')} onBlur={() => setFocused(null)} />
            {/* Whether anyone can take an errand starting here. Shown before the customer
                writes the rest, since the server refuses the Mandao outright without a driver. */}
            {checkingDrivers ? (
              <Text style={styles.hint}>{tx.checkingDrivers}</Text>
            ) : noDrivers ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  {drivers?.reason === 'FLEET_OFFLINE' ? tx.noDriversFleet : tx.noDrivers}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={[styles.primary, (pickup.lat == null || !pickupAddress.trim() || noDrivers) && styles.disabled]}
              disabled={pickup.lat == null || !pickupAddress.trim() || noDrivers}
              onPress={goNext}
            >
              <Text style={styles.primaryText}>{tx.continueLabel}</Text>
            </Pressable>
          </KeyboardAvoidingView>
        )}

        {/* Step 3 -- where it is brought, with the ride from the pickup drawn on the map. */}
        {stepKey === 'dropoff' && (
          <KeyboardAvoidingView style={styles.mapStep}>
            <View style={styles.locRow}>
              <Text style={styles.hint}>{tx.dropoffHint}</Text>
              <Pressable style={styles.locBtn} onPress={() => useMyLocation('dropoff')} disabled={locating}>
                {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>{tx.myLocation}</Text>}
              </Pressable>
            </View>
            <LocationPicker
              key={`dropoff-${dropoffMapKey}`}
              latitude={dropoff.lat ?? pickup.lat ?? DEFAULT_CENTER.lat}
              longitude={dropoff.lng ?? pickup.lng ?? DEFAULT_CENTER.lng}
              origin={pickupOrigin}
              onPick={(loc) => {
                setDropoff({ lat: loc.lat, lng: loc.lng });
                setDropoffLabel(null);
                if (loc.address) setDropoffAddress(loc.address);
              }}
            />
            <View style={styles.labelRow}>
              <Text style={[styles.labelText, { flex: 1 }]}>{tx.dropoffAddress}</Text>
              {dropoffLabel ? <Text style={styles.labelBadge}>{dropoffLabel}</Text> : null}
              <KeyboardCloseButton visible={focused === 'dropoffAddress'} />
            </View>
            <TextInput style={styles.addressInput} value={dropoffAddress} onChangeText={setDropoffAddress}
              placeholder={tx.dropoffAddress} placeholderTextColor={t.textFaint} multiline
              onFocus={() => setFocused('dropoffAddress')} onBlur={() => setFocused(null)} />
            <Pressable
              style={[styles.primary, (dropoff.lat == null || !dropoffAddress.trim()) && styles.disabled]}
              disabled={dropoff.lat == null || !dropoffAddress.trim()}
              onPress={goNext}
            >
              <Text style={styles.primaryText}>{tx.continueLabel}</Text>
            </Pressable>
          </KeyboardAvoidingView>
        )}

        {/* Step 4 -- review: the errand, both ends, what it costs, and the cash question. */}
        {stepKey === 'summary' && (
          <>
            <View style={styles.reviewMap}>
              <LocationPicker
                latitude={dropoff.lat ?? DEFAULT_CENTER.lat}
                longitude={dropoff.lng ?? DEFAULT_CENTER.lng}
                origin={pickupOrigin}
                onPick={(loc) => { setDropoff({ lat: loc.lat, lng: loc.lng }); if (loc.address) setDropoffAddress(loc.address); }}
              />
            </View>
            <KeyboardAwareScrollView contentContainerStyle={styles.scroll}>
              <Text style={styles.label}>{tx.whatLabel}</Text>
              <View style={styles.card}><Text style={styles.cardText}>{description.trim()}</Text></View>

              <Text style={styles.label}>{tx.goToLabel}</Text>
              <View style={styles.addrCard}>
                <Text style={styles.pin}>🏁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrText}>{pickupAddress}</Text>
                  {pickupReference.trim() ? <Text style={styles.addrSub}>{pickupReference.trim()}</Text> : null}
                </View>
              </View>

              <Text style={styles.label}>{tx.bringToLabel}</Text>
              <View style={styles.addrCard}>
                <Text style={styles.pin}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrText}>{dropoffAddress}</Text>
                  {eta ? <Text style={styles.addrSub}>{tx.etaLabel(formatEta(eta))}</Text> : null}
                </View>
              </View>

              <Text style={styles.label}>{tx.costsLabel}</Text>
              <View style={styles.costLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costName}>{fee != null && eta ? tx.serviceFee(formatEta(eta)) : tx.feePending}</Text>
                  <Text style={styles.addrSub}>{tx.serviceFeeIncludes(money(MANDAO_SURCHARGE_RD))}</Text>
                </View>
                {fee != null ? <Text style={styles.costPrice}>{money(fee)}</Text> : null}
              </View>
              <View style={styles.costLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costName}>{tx.purchasesLabel}</Text>
                  {budgetAmount > 0 ? <Text style={styles.addrSub}>{tx.purchasesNote}</Text> : null}
                </View>
                <Text style={styles.costPrice}>{budgetAmount > 0 ? tx.purchasesUpTo(money(budgetAmount)) : tx.purchasesNone}</Text>
              </View>

              <Text style={styles.label}>{tx.paymentLabel}</Text>
              <View style={styles.card}><Text style={styles.cardText}>{tx.cashNote}</Text></View>
              <Text style={styles.label}>{tx.payWithLabel}</Text>
              <TextInput
                style={styles.input}
                value={payWith}
                onChangeText={setPayWith}
                placeholder={tx.payWithPlaceholder(money(maxTotal))}
                placeholderTextColor={t.textFaint}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {payWithNum != null && !payWithValid ? (
                <Text style={styles.error}>{tx.payWithError(money(maxTotal))}</Text>
              ) : changeDue != null && changeDue > 0 ? (
                <Text style={styles.change}>{tx.changeDue(money(changeDue))}</Text>
              ) : null}
            </KeyboardAwareScrollView>
            <Footer label={budgetAmount > 0 ? tx.totalUpTo : tx.total} total={maxTotal}>
              <Pressable
                style={[styles.primary, (submitting || !payWithValid) && styles.disabled]}
                onPress={submit}
                disabled={submitting || !payWithValid}
              >
                {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.primaryText}>{tx.submit}</Text>}
              </Pressable>
            </Footer>
          </>
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

function Stepper({ current }: { current: number }) {
  const titles = mandaoStepTitles();
  return (
    <View style={styles.stepperRow}>
      {MANDAO_STEPS.map((key, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <View key={key} style={styles.stepItem}>
            <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
              <Text style={[styles.stepDotText, (active || done) && { color: t.onAccent }]}>{done ? '✓' : i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>{titles[key]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Footer({ label, total, children }: { label: string; total: number; children: ReactNode }) {
  return (
    <View style={styles.footer}>
      <View style={styles.totalRow}><Text style={styles.totalLabel}>{label}</Text><Text style={styles.totalValue}>{money(total)}</Text></View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },

  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: t.accent },
  stepDotText: { fontSize: 13, fontWeight: '800', color: t.text },
  stepLabel: { fontSize: 11, color: t.textFaint, fontWeight: '600' },
  stepLabelActive: { color: t.text, fontWeight: '800' },

  scroll: { padding: 16, paddingBottom: 24 },

  hero: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 16 },
  heroEmoji: { fontSize: 38 },
  heroTitle: { fontSize: 17, fontWeight: '900', color: t.text },
  heroText: { fontSize: 13, color: t.textMuted, lineHeight: 19, marginTop: 4 },
  howCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 14, marginTop: 10, gap: 10 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  howNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
  howNumText: { color: t.onAccent, fontWeight: '900', fontSize: 12 },
  howText: { flex: 1, fontSize: 13, color: t.text, fontWeight: '600', lineHeight: 18 },

  label: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: 14, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6 },
  labelText: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  labelBadge: {
    fontSize: 12, fontWeight: '800', color: t.text, backgroundColor: t.cardStrong,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden',
  },
  description: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, minHeight: 130, fontSize: 15, color: t.text, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 11, color: t.textFaint, marginTop: 4, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: t.text, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text },
  hintSmall: { color: t.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  error: { color: t.danger, fontSize: 13, fontWeight: '700', marginTop: 6 },
  change: { color: t.success, fontSize: 14, fontWeight: '800', marginTop: 6 },

  mapStep: { flex: 1, padding: 16 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  hint: { flex: 1, fontSize: 14, color: t.textMuted, fontWeight: '600' },
  locBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 118, alignItems: 'center' },
  locBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },
  addressInput: { backgroundColor: t.card, borderRadius: 12, padding: 14, minHeight: 56, fontSize: 15, color: t.text, textAlignVertical: 'top', borderWidth: 1, borderColor: t.border },

  reviewMap: { height: 200, marginHorizontal: 16, marginTop: 14, borderRadius: 12, overflow: 'hidden' },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  cardText: { fontSize: 15, color: t.text, lineHeight: 21 },
  addrCard: { flexDirection: 'row', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 16 },
  addrText: { fontSize: 15, color: t.text, fontWeight: '600' },
  addrSub: { fontSize: 12, color: t.textMuted, fontWeight: '600', marginTop: 4, lineHeight: 17 },
  costLine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
  costName: { fontSize: 15, fontWeight: '700', color: t.text },
  costPrice: { fontSize: 14, fontWeight: '800', color: t.text },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: t.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: t.textMuted },
  totalValue: { fontSize: 22, fontWeight: '800', color: t.text },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  // "Nobody can take this" -- a stop sign, not a hint, since it blocks the step.
  warning: {
    backgroundColor: 'rgba(254,202,202,0.18)', borderWidth: 1, borderColor: t.danger,
    borderRadius: 12, padding: 12, marginTop: 4,
  },
  warningText: { color: t.danger, fontSize: 13, fontWeight: '700' },
});
