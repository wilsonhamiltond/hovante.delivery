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
import { rideFeeRd } from '../src/deliveryFee';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import { detectCurrentLocation } from '../src/profileForm';
import { useSessionLocation } from '../src/sessionLocation';
import { RIDE_STEPS, rideStepTitles, type RideStepKey } from '../src/checkoutSteps';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { KeyboardCloseButton } from '../src/KeyboardCloseButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const money = (n: number) => `RD$${n.toFixed(2)}`;

// The longest note the server keeps.
const NOTE_MAX = 500;

type Point = { lat: number | null; lng: number | null };

const S: Record<
  Locale,
  {
    brand: string;
    tagline: string;
    intro: string;
    continueLabel: string;
    pickupHint: string;
    noDrivers: string;
    checkingDrivers: string;
    destinationHint: string;
    myLocation: string;
    mapPoint: string;
    noteLabel: string;
    noteReviewLabel: string;
    noteEmpty: string;
    notePlaceholder: string;
    locPermTitle: string;
    locPermBody: string;
    locTitle: string;
    locFailed: string;
    fromLabel: string;
    toLabel: string;
    etaLabel: (eta: string) => string;
    costsLabel: string;
    tripFee: (eta: string) => string;
    tripFeeIncludes: string;
    feePending: string;
    paymentLabel: string;
    cashNote: string;
    paymentMethod: string;
    cashTitle: string;
    cashSub: string;
    cardTitle: string;
    cardSub: string;
    comingSoon: string;
    submit: string;
    failedTitle: string;
    total: string;
  }
> = {
  es: {
    brand: 'Volao Viaje',
    tagline: '¿Vas para algún lado? Volao te lleva.',
    intro: 'Un conductor te recoge donde estés y te lleva a donde vayas. Pagas solo el recorrido, en efectivo al llegar.',
    continueLabel: 'Continuar',
    pickupHint: 'Toca el mapa donde te recogemos',
    noDrivers: 'No hay conductores disponibles cerca de ti en este momento. Intenta de nuevo en unos minutos.',
    checkingDrivers: 'Buscando conductores disponibles…',
    destinationHint: 'Toca el mapa a dónde vas',
    myLocation: '📍 Mi ubicación',
    mapPoint: 'Ubicación elegida en el mapa',
    noteLabel: 'Nota para el conductor (opcional)',
    noteReviewLabel: 'Nota para el conductor',
    noteEmpty: 'Sin nota',
    notePlaceholder: 'Ej: voy con una maleta, somos dos…',
    locPermTitle: 'Permiso de ubicación',
    locPermBody: 'Activa el permiso de ubicación para usar tu ubicación actual.',
    locTitle: 'Ubicación',
    locFailed: 'No se pudo obtener tu ubicación actual.',
    fromLabel: 'Te recogemos en',
    toLabel: 'Y te llevamos a',
    etaLabel: (eta) => `⏱️ ${eta} de viaje`,
    costsLabel: 'Costo',
    tripFee: (eta) => `Volao Viaje · ${eta}`,
    tripFeeIncludes: 'Solo el recorrido: sin cargos por tiempo de espera',
    feePending: 'Se calcula al conocer la distancia',
    paymentLabel: 'Pago',
    cashNote: '💵 Efectivo, al llegar a tu destino',
    paymentMethod: 'Método de pago',
    cashTitle: 'Efectivo',
    cashSub: 'Pagas al llegar a tu destino',
    cardTitle: 'Tarjeta de crédito',
    cardSub: 'Muy pronto',
    comingSoon: 'Próximamente',
    submit: 'Pedir Volao Viaje',
    failedTitle: 'No se pudo pedir el Volao Viaje',
    total: 'Total',
  },
  en: {
    brand: 'Volao Viaje',
    tagline: 'Going somewhere? Volao takes you.',
    intro: 'A driver picks you up wherever you are and takes you where you are going. You only pay for the ride, in cash on arrival.',
    continueLabel: 'Continue',
    pickupHint: 'Tap the map where we pick you up',
    noDrivers: 'No drivers are available near you right now. Try again in a few minutes.',
    checkingDrivers: 'Looking for available drivers…',
    destinationHint: 'Tap the map where you are going',
    myLocation: '📍 My location',
    mapPoint: 'Point chosen on the map',
    noteLabel: 'Note for the driver (optional)',
    noteReviewLabel: 'Note for the driver',
    noteEmpty: 'No note',
    notePlaceholder: 'E.g.: I have a suitcase, there are two of us…',
    locPermTitle: 'Location permission',
    locPermBody: 'Enable the location permission to use your current location.',
    locTitle: 'Location',
    locFailed: 'Could not get your current location.',
    fromLabel: 'We pick you up at',
    toLabel: 'And take you to',
    etaLabel: (eta) => `⏱️ ${eta} trip`,
    costsLabel: 'Cost',
    tripFee: (eta) => `Volao Viaje · ${eta}`,
    tripFeeIncludes: 'The ride only: no charge for waiting time',
    feePending: 'Calculated once the distance is known',
    paymentLabel: 'Payment',
    cashNote: '💵 Cash, when you reach your destination',
    paymentMethod: 'Payment method',
    cashTitle: 'Cash',
    cashSub: 'You pay when you reach your destination',
    cardTitle: 'Credit card',
    cardSub: 'Coming soon',
    comingSoon: 'Coming soon',
    submit: 'Request Volao Viaje',
    failedTitle: 'The Volao Viaje could not be requested',
    total: 'Total',
  },
  fr: {
    brand: 'Volao Viaje',
    tagline: 'Vous allez quelque part ? Volao vous emmène.',
    intro: 'Un chauffeur vous prend là où vous êtes et vous emmène où vous allez. Vous ne payez que le trajet, en espèces à l’arrivée.',
    continueLabel: 'Continuer',
    pickupHint: 'Touchez la carte là où nous vous prenons',
    noDrivers: 'Aucun chauffeur n’est disponible près de vous pour le moment. Réessayez dans quelques minutes.',
    checkingDrivers: 'Recherche de chauffeurs disponibles…',
    destinationHint: 'Touchez la carte là où vous allez',
    myLocation: '📍 Ma position',
    mapPoint: 'Point choisi sur la carte',
    noteLabel: 'Note pour le chauffeur (facultatif)',
    noteReviewLabel: 'Note pour le chauffeur',
    noteEmpty: 'Aucune note',
    notePlaceholder: 'Ex. : j’ai une valise, nous sommes deux…',
    locPermTitle: 'Autorisation de localisation',
    locPermBody: 'Activez l’autorisation de localisation pour utiliser votre position actuelle.',
    locTitle: 'Localisation',
    locFailed: 'Impossible d’obtenir votre position actuelle.',
    fromLabel: 'Nous vous prenons à',
    toLabel: 'Et vous emmenons à',
    etaLabel: (eta) => `⏱️ ${eta} de trajet`,
    costsLabel: 'Coût',
    tripFee: (eta) => `Volao Viaje · ${eta}`,
    tripFeeIncludes: 'Le trajet seulement : pas de frais d’attente',
    feePending: 'Calculé une fois la distance connue',
    paymentLabel: 'Paiement',
    cashNote: '💵 Espèces, à l’arrivée',
    paymentMethod: 'Moyen de paiement',
    cashTitle: 'Espèces',
    cashSub: 'Vous payez à l’arrivée',
    cardTitle: 'Carte de crédit',
    cardSub: 'Très bientôt',
    comingSoon: 'Prochainement',
    submit: 'Demander Volao Viaje',
    failedTitle: 'Le Volao Viaje n’a pas pu être demandé',
    total: 'Total',
  },
};

// "Volao Viaje": a driver picks the customer up and takes them somewhere. Three steps -- where
// you are, where you are going, review -- then the same tracking screen every order uses. Like a
// Mandao there is no merchant: the server drops it into the driver pool the moment it is placed.
// Unlike one there is nothing to buy and no errand time, so the price is the route alone.
// Guests can go as far as the price; asking for the ride is what needs an account.
export default function RideScreen() {
  const router = useRouter();
  const { token, profileComplete } = useAuth();
  const { promptLogin } = useAuthPrompt();
  const session = useSessionLocation();
  const tx = useStrings(S);

  const [stepKey, setStepKey] = useState<RideStepKey>('pickup');

  const [pickup, setPickup] = useState<Point>({ lat: null, lng: null });
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupMapKey, setPickupMapKey] = useState(0);

  const [destination, setDestination] = useState<Point>({ lat: null, lng: null });
  const [destinationAddress, setDestinationAddress] = useState('');
  const [note, setNote] = useState('');

  const [locating, setLocating] = useState(false);
  const [drivers, setDrivers] = useState<api.DriverAvailability | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  // The pickup defaults to where the customer is: the session pin from the home header first,
  // then their saved address. The destination starts empty -- it is rarely home.
  useEffect(() => {
    if (session.location) {
      setPickupAddress(session.location.address);
      setPickup({ lat: session.location.latitude, lng: session.location.longitude });
      if (session.location.latitude != null) setPickupMapKey((k) => k + 1);
      return;
    }
    if (!token) return;
    api.me().then((res) => {
      if (!res.success || !res.data) return;
      setPickupAddress(res.data.address ?? '');
      setPickup({ lat: res.data.latitude ?? null, lng: res.data.longitude ?? null });
      if (res.data.latitude != null && res.data.longitude != null) setPickupMapKey((k) => k + 1);
    });
  }, []);

  // Same advisory check as the Mandao: is anyone around the pickup pin? Debounced while the pin
  // moves; only a definite "nobody" blocks the step, since the server decides for real anyway.
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

  const noDrivers = drivers != null && !drivers.available;

  // The trip the fee is billed on. Null while a pin is missing or the router cannot answer.
  const eta = useRouteEta(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const fee = eta ? rideFeeRd(eta.distanceM) : null;
  const total = fee ?? 0;

  const stepIndex = Math.max(0, RIDE_STEPS.indexOf(stepKey));
  const goNext = () => {
    Keyboard.dismiss();
    setStepKey(RIDE_STEPS[Math.min(RIDE_STEPS.length - 1, stepIndex + 1)]);
  };
  const goBack = () => setStepKey(RIDE_STEPS[Math.max(0, stepIndex - 1)]);

  const useMyLocation = async (target: 'pickup' | 'destination') => {
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
      setDestination(point);
      if (result.location.address) setDestinationAddress(result.location.address);
    }
  };

  const submit = async () => {
    // Account-based, like ordering: a guest signs in here, and an account that skipped the
    // profile is sent back to it -- the driver needs a name and a phone to find them.
    if (!token) { promptLogin(); return; }
    if (profileComplete === false) { router.push('/complete-profile'); return; }
    if (pickup.lat == null || pickup.lng == null || destination.lat == null || destination.lng == null) return;
    setSubmitting(true);
    const res = await api.createRide({
      pickupAddress: pickupAddress.trim() || undefined,
      pickupLatitude: pickup.lat,
      pickupLongitude: pickup.lng,
      address: destinationAddress.trim() || undefined,
      latitude: destination.lat,
      longitude: destination.lng,
      note: note.trim() || undefined,
      // The measured route; the server rebuilds the fee from it with its own tariff.
      deliveryDistanceM: eta ? Math.round(eta.distanceM) : undefined,
    });
    setSubmitting(false);
    if (!res.success) { Alert.alert(tx.failedTitle, res.message); return; }
    router.replace(`/order/${res.data.id}`);
  };

  const pickupOrigin = pickup.lat != null && pickup.lng != null
    ? { lat: pickup.lat, lng: pickup.lng, title: pickupAddress || tx.fromLabel }
    : null;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={() => (stepIndex === 0
            ? (router.canGoBack() ? router.back() : router.replace('/home'))
            : goBack())} />
          <Text style={styles.title}>{stepIndex === 0 ? tx.brand : rideStepTitles()[stepKey]}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>
        <Stepper current={stepIndex} />

        {/* Step 1 -- where the driver collects them, with the service explained above the map. */}
        {stepKey === 'pickup' && (
          <KeyboardAvoidingView style={styles.mapStep}>
            <View style={styles.hero}>
              <Text style={styles.heroEmoji}>🏍️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{tx.tagline}</Text>
                <Text style={styles.heroText}>{tx.intro}</Text>
              </View>
            </View>
            <View style={[styles.locRow, { marginTop: 12 }]}>
              <Text style={styles.hint}>{tx.pickupHint}</Text>
              <Pressable style={styles.locBtn} onPress={() => useMyLocation('pickup')} disabled={locating}>
                {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>{tx.myLocation}</Text>}
              </Pressable>
            </View>
            <LocationPicker
              key={`pickup-${pickupMapKey}`}
              latitude={pickup.lat ?? DEFAULT_CENTER.lat}
              longitude={pickup.lng ?? DEFAULT_CENTER.lng}
              onPick={(loc) => {
                setPickup({ lat: loc.lat, lng: loc.lng });
                if (loc.address) setPickupAddress(loc.address);
              }}
            />
            {checkingDrivers ? (
              <Text style={[styles.hint, { marginTop: 8 }]}>{tx.checkingDrivers}</Text>
            ) : noDrivers ? (
              <View style={styles.warning}><Text style={styles.warningText}>{tx.noDrivers}</Text></View>
            ) : null}
            <Pressable
              style={[styles.primary, (pickup.lat == null || noDrivers) && styles.disabled]}
              disabled={pickup.lat == null || noDrivers}
              onPress={goNext}
            >
              <Text style={styles.primaryText}>{tx.continueLabel}</Text>
            </Pressable>
          </KeyboardAvoidingView>
        )}

        {/* Step 2 -- where they are going, with the trip from the pickup drawn on the map. */}
        {stepKey === 'destination' && (
          <KeyboardAvoidingView style={styles.mapStep}>
            <View style={styles.locRow}>
              <Text style={styles.hint}>{tx.destinationHint}</Text>
              <Pressable style={styles.locBtn} onPress={() => useMyLocation('destination')} disabled={locating}>
                {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>{tx.myLocation}</Text>}
              </Pressable>
            </View>
            <LocationPicker
              latitude={destination.lat ?? pickup.lat ?? DEFAULT_CENTER.lat}
              longitude={destination.lng ?? pickup.lng ?? DEFAULT_CENTER.lng}
              origin={pickupOrigin}
              onPick={(loc) => {
                setDestination({ lat: loc.lat, lng: loc.lng });
                if (loc.address) setDestinationAddress(loc.address);
              }}
            />
            <Pressable
              style={[styles.primary, destination.lat == null && styles.disabled]}
              disabled={destination.lat == null}
              onPress={goNext}
            >
              <Text style={styles.primaryText}>{tx.continueLabel}</Text>
            </Pressable>
          </KeyboardAvoidingView>
        )}

        {/* Step 3 -- details: how they pay, and anything the driver should know before coming. */}
        {stepKey === 'details' && (
          <>
            <KeyboardAwareScrollView contentContainerStyle={styles.scroll}>
              <Text style={styles.label}>{tx.paymentMethod}</Text>
              {/* Cash is the only method that works today; the card sits here disabled so the
                  choice reads as "coming", not missing -- the same pair the order's checkout
                  shows, and the reason the ride payload carries no payment type at all. */}
              <Pressable style={[styles.optionCard, styles.optionActive]} accessibilityRole="button">
                <Text style={styles.optionIcon}>💵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{tx.cashTitle}</Text>
                  <Text style={styles.optionSub}>{tx.cashSub}</Text>
                </View>
                <View style={[styles.radio, styles.radioActive]}><View style={styles.radioDot} /></View>
              </Pressable>
              <View style={[styles.optionCard, styles.optionDisabled]}>
                <Text style={styles.optionIcon}>💳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{tx.cardTitle}</Text>
                  <Text style={styles.optionSub}>{tx.cardSub}</Text>
                </View>
                <View style={styles.soonBadge}><Text style={styles.soonBadgeText}>{tx.comingSoon}</Text></View>
              </View>

              <View style={styles.labelRow}>
                <Text style={[styles.labelText, { flex: 1 }]}>{tx.noteLabel}</Text>
                <KeyboardCloseButton visible={focused === 'note'} />
              </View>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
                placeholder={tx.notePlaceholder}
                placeholderTextColor={t.textFaint}
                multiline
                onFocus={() => setFocused('note')}
                onBlur={() => setFocused(null)}
              />
            </KeyboardAwareScrollView>
            <Footer label={tx.total} total={total}>
              <Pressable style={styles.primary} onPress={goNext}>
                <Text style={styles.primaryText}>{tx.continueLabel}</Text>
              </Pressable>
            </Footer>
          </>
        )}

        {/* Step 4 -- review: both ends, the price and the cash question. */}
        {stepKey === 'summary' && (
          <>
            <View style={styles.reviewMap}>
              <LocationPicker
                latitude={destination.lat ?? DEFAULT_CENTER.lat}
                longitude={destination.lng ?? DEFAULT_CENTER.lng}
                origin={pickupOrigin}
                onPick={(loc) => { setDestination({ lat: loc.lat, lng: loc.lng }); if (loc.address) setDestinationAddress(loc.address); }}
              />
            </View>
            <KeyboardAwareScrollView contentContainerStyle={styles.scroll}>
              <Text style={styles.label}>{tx.fromLabel}</Text>
              <View style={styles.addrCard}>
                <Text style={styles.pin}>🙋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrText}>{pickupAddress.trim() || tx.mapPoint}</Text>
                </View>
              </View>

              <Text style={styles.label}>{tx.toLabel}</Text>
              <View style={styles.addrCard}>
                <Text style={styles.pin}>🏁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrText}>{destinationAddress.trim() || tx.mapPoint}</Text>
                  {eta ? <Text style={styles.addrSub}>{tx.etaLabel(formatEta(eta))}</Text> : null}
                </View>
              </View>

              <Text style={styles.label}>{tx.costsLabel}</Text>
              <View style={styles.costLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costName}>{fee != null && eta ? tx.tripFee(formatEta(eta)) : tx.feePending}</Text>
                  <Text style={styles.addrSub}>{tx.tripFeeIncludes}</Text>
                </View>
                {fee != null ? <Text style={styles.costPrice}>{money(fee)}</Text> : null}
              </View>

              <Text style={styles.label}>{tx.paymentLabel}</Text>
              <View style={styles.card}><Text style={styles.cardText}>{tx.cashNote}</Text></View>

              {/* What they told the driver one step back, read back here -- the review is the
                  last chance to notice it went in wrong. */}
              <Text style={styles.label}>{tx.noteReviewLabel}</Text>
              <View style={styles.card}>
                <Text style={[styles.cardText, !note.trim() && styles.cardTextMuted]}>
                  {note.trim() || tx.noteEmpty}
                </Text>
              </View>
            </KeyboardAwareScrollView>
            <Footer label={tx.total} total={total}>
              <Pressable
                style={[styles.primary, submitting && styles.disabled]}
                onPress={submit}
                disabled={submitting}
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
  const titles = rideStepTitles();
  return (
    <View style={styles.stepperRow}>
      {RIDE_STEPS.map((key, i) => {
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

  hero: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14 },
  heroEmoji: { fontSize: 34 },
  heroTitle: { fontSize: 16, fontWeight: '900', color: t.text },
  heroText: { fontSize: 13, color: t.textMuted, lineHeight: 18, marginTop: 4 },

  label: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: 14, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6 },
  labelText: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  input: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text },

  mapStep: { flex: 1, padding: 16 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  hint: { flex: 1, fontSize: 14, color: t.textMuted, fontWeight: '600' },
  locBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 118, alignItems: 'center' },
  locBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },

  reviewMap: { height: 200, marginHorizontal: 16, marginTop: 14, borderRadius: 12, overflow: 'hidden' },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  cardText: { fontSize: 15, color: t.text, lineHeight: 21 },
  cardTextMuted: { color: t.textMuted, fontStyle: 'italic' },
  addrCard: { flexDirection: 'row', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 16 },
  addrText: { fontSize: 15, color: t.text, fontWeight: '600' },
  addrSub: { fontSize: 12, color: t.textMuted, fontWeight: '600', marginTop: 4, lineHeight: 17 },
  costLine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
  costName: { fontSize: 15, fontWeight: '700', color: t.text },
  costPrice: { fontSize: 14, fontWeight: '800', color: t.text },

  // Step 3 (details): the payment option cards, same shape as the order's checkout.
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14,
    padding: 14, marginBottom: 10,
  },
  optionActive: { borderColor: 'rgba(255,255,255,0.75)', backgroundColor: t.cardStrong },
  optionDisabled: { opacity: 0.55 },
  optionIcon: { fontSize: 22 },
  optionTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  optionSub: { fontSize: 12, fontWeight: '600', color: t.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#ffffff' },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#ffffff' },
  soonBadge: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  soonBadgeText: { color: t.textMuted, fontSize: 11, fontWeight: '800' },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: t.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: t.textMuted },
  totalValue: { fontSize: 22, fontWeight: '800', color: t.text },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  warning: {
    backgroundColor: 'rgba(254,202,202,0.18)', borderWidth: 1, borderColor: t.danger,
    borderRadius: 12, padding: 12, marginTop: 8,
  },
  warningText: { color: t.danger, fontSize: 13, fontWeight: '700' },
});
