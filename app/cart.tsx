import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../src/auth';
import { useAuthPrompt } from '../src/AuthPrompt';
import { useCart } from '../src/cart';
import { emojiFor } from '../src/categoryEmoji';
import * as api from '../src/api';
import { formatEta, useRouteEta } from '../src/eta';
import { deliveryFeeRd } from '../src/deliveryFee';
import { LocationPicker } from '../src/LocationPicker';
import { PointsMap } from '../src/PointsMap';
import { DEFAULT_CENTER, type DeliveryArea } from '../src/mapHtml';
import { pointInPolygon } from '../src/geo';
import { detectCurrentLocation } from '../src/profileForm';
import { sessionLocationLabel, useSessionLocation } from '../src/sessionLocation';
import { stepTitles, stepsFor, type StepKey } from '../src/checkoutSteps';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const money = (n: number) => `RD$${n.toFixed(2)}`;

const S: Record<
  Locale,
  {
    yourOrder: string;
    emptyTitle: string;
    emptySubtitle: string;
    exploreMerchants: string;
    branch: string;
    branchLead: string;
    continueLabel: string;
    deliveryMode: string;
    deliveryTitle: string;
    deliverySub: string;
    pickupTitle: string;
    pickupSub: string;
    paymentMethod: string;
    cashTitle: string;
    cashSub: string;
    cardTitle: string;
    cardSub: string;
    comingSoon: string;
    tapInsideArea: string;
    tapMap: string;
    myLocation: string;
    theMerchant: string;
    moreBranches: (n: number) => string;
    deliveryAddress: string;
    thisMerchant: string;
    outsideWarn: (name: string) => string;
    outsideTitle: string;
    outsideBody: string;
    locPermTitle: string;
    locPermBody: string;
    locTitle: string;
    locFailed: string;
    orderFailedTitle: string;
    notesLabel: string;
    notesPlaceholder: string;
    payWithLabel: string;
    payWithPlaceholder: (total: string) => string;
    payWithError: (total: string) => string;
    changeDue: (amount: string) => string;
    detailsLabel: string;
    cashPaymentSuffix: string;
    payingWithSuffix: (pay: string, change: string) => string;
    deliverAt: string;
    pickUpAt: string;
    noAddress: string;
    etaFrom: (eta: string, name: string) => string;
    fromMerchantFallback: string;
    productsAt: (name: string | null) => string;
    shippingLabel: string;
    pickupNoShipping: string;
    homeDelivery: (eta: string) => string;
    feePending: string;
    noteLabel: string;
    noNote: string;
    placeOrderLabel: string;
    total: string;
  }
> = {
  es: {
    yourOrder: 'Tu pedido',
    emptyTitle: 'Tu carrito está vacío',
    emptySubtitle: 'Agrega productos de tus comercios favoritos y los verás aquí.',
    exploreMerchants: 'Explorar comercios',
    branch: 'Sucursal',
    branchLead: 'Varias sucursales entregan en tu ubicación. Elige desde cuál quieres tu pedido.',
    continueLabel: 'Continuar',
    deliveryMode: 'Modo de entrega',
    deliveryTitle: 'Delivery',
    deliverySub: 'Te lo llevamos a tu ubicación',
    pickupTitle: 'Retiro en tienda',
    pickupSub: 'Lo recoges tú en el comercio · sin costo de envío',
    paymentMethod: 'Método de pago',
    cashTitle: 'Efectivo',
    cashSub: 'Pagas al recibir tu pedido',
    cardTitle: 'Tarjeta de crédito',
    cardSub: 'Muy pronto',
    comingSoon: 'Próximamente',
    tapInsideArea: 'Toca dentro del área marcada para elegir dónde entregar',
    tapMap: 'Toca el mapa para elegir dónde entregar',
    myLocation: '📍 Mi ubicación',
    theMerchant: 'El comercio',
    moreBranches: (n) => ` y ${n} sucursal(es) más`,
    deliveryAddress: 'Dirección de entrega',
    thisMerchant: 'este comercio',
    outsideWarn: (name) => `Este punto está fuera del área de entrega de ${name}. Elige uno dentro del recuadro.`,
    outsideTitle: 'Fuera del área de entrega',
    outsideBody: 'Este comercio solo entrega dentro del área marcada en el mapa. Elige un punto dentro del área.',
    locPermTitle: 'Permiso de ubicación',
    locPermBody: 'Activa el permiso de ubicación para usar tu ubicación actual.',
    locTitle: 'Ubicación',
    locFailed: 'No se pudo obtener tu ubicación actual.',
    orderFailedTitle: 'No se pudo crear el pedido',
    notesLabel: 'Notas para el comercio',
    notesPlaceholder: 'Ej: sin cebolla, tocar el timbre…',
    payWithLabel: '¿Con cuánto vas a pagar?',
    payWithPlaceholder: (total) => `Ej: 1000 · total ${total} · vacío si pagas exacto`,
    payWithError: (total) => `Debe cubrir el total del pedido (${total}).`,
    changeDue: (amount) => `Tu devuelta: ${amount}`,
    detailsLabel: 'Detalles',
    cashPaymentSuffix: ' · Pago en efectivo',
    payingWithSuffix: (pay, change) => ` · Pagas con ${pay} · devuelta ${change}`,
    deliverAt: 'Entregar en',
    pickUpAt: 'Retirar en',
    noAddress: 'Sin dirección',
    etaFrom: (eta, name) => `⏱️ ${eta} desde ${name}`,
    fromMerchantFallback: 'el comercio',
    productsAt: (name) => `Productos · ${name}`,
    shippingLabel: 'Envío',
    pickupNoShipping: 'Retiro en tienda · sin costo de envío',
    homeDelivery: (eta) => `Entrega a domicilio · ${eta}`,
    feePending: 'Se calcula al conocer la distancia',
    noteLabel: 'Nota',
    noNote: 'Sin nota',
    placeOrderLabel: 'Realizar pedido',
    total: 'Total',
  },
  en: {
    yourOrder: 'Your order',
    emptyTitle: 'Your cart is empty',
    emptySubtitle: "Add products from your favorite merchants and you'll see them here.",
    exploreMerchants: 'Explore merchants',
    branch: 'Branch',
    branchLead: 'Several branches deliver to your location. Choose which one you want your order from.',
    continueLabel: 'Continue',
    deliveryMode: 'Delivery mode',
    deliveryTitle: 'Delivery',
    deliverySub: 'We bring it to your location',
    pickupTitle: 'Store pickup',
    pickupSub: 'You pick it up at the store · no delivery fee',
    paymentMethod: 'Payment method',
    cashTitle: 'Cash',
    cashSub: 'You pay when you receive your order',
    cardTitle: 'Credit card',
    cardSub: 'Coming soon',
    comingSoon: 'Coming soon',
    tapInsideArea: 'Tap inside the marked area to choose where to deliver',
    tapMap: 'Tap the map to choose where to deliver',
    myLocation: '📍 My location',
    theMerchant: 'The merchant',
    moreBranches: (n) => ` and ${n} more branch(es)`,
    deliveryAddress: 'Delivery address',
    thisMerchant: 'this merchant',
    outsideWarn: (name) => `This point is outside ${name}'s delivery area. Choose one inside the boundary.`,
    outsideTitle: 'Outside the delivery area',
    outsideBody: 'This merchant only delivers within the area marked on the map. Choose a point inside the area.',
    locPermTitle: 'Location permission',
    locPermBody: 'Enable the location permission to use your current location.',
    locTitle: 'Location',
    locFailed: 'Could not get your current location.',
    orderFailedTitle: 'The order could not be placed',
    notesLabel: 'Notes for the merchant',
    notesPlaceholder: 'E.g.: no onions, ring the doorbell…',
    payWithLabel: 'How much will you pay with?',
    payWithPlaceholder: (total) => `E.g.: 1000 · total ${total} · leave empty for exact payment`,
    payWithError: (total) => `It must cover the order total (${total}).`,
    changeDue: (amount) => `Your change: ${amount}`,
    detailsLabel: 'Details',
    cashPaymentSuffix: ' · Cash payment',
    payingWithSuffix: (pay, change) => ` · Paying with ${pay} · change ${change}`,
    deliverAt: 'Deliver to',
    pickUpAt: 'Pick up at',
    noAddress: 'No address',
    etaFrom: (eta, name) => `⏱️ ${eta} from ${name}`,
    fromMerchantFallback: 'the merchant',
    productsAt: (name) => `Products · ${name}`,
    shippingLabel: 'Delivery fee',
    pickupNoShipping: 'Store pickup · no delivery fee',
    homeDelivery: (eta) => `Home delivery · ${eta}`,
    feePending: 'Calculated once the distance is known',
    noteLabel: 'Note',
    noNote: 'No note',
    placeOrderLabel: 'Place order',
    total: 'Total',
  },
};

// Checkout wizard: 1) review the cart, 2) choose the order's details (delivery mode + payment),
// 3) pick the delivery location on a map, 4) add a note, 5) review and place the order.
//
// The details come before the location so the mode is known before the map: a "retiro en tienda"
// order has nowhere to be delivered, so it skips the location step entirely and runs in four steps
// rather than making the customer pin an address the order will never use.
export default function CartScreen() {
  const router = useRouter();
  const { token, profileComplete } = useAuth();
  const { promptLogin } = useAuthPrompt();
  const cart = useCart();
  const session = useSessionLocation();
  const tx = useStrings(S);
  // The wizard's position is held as the step's KEY, not its number: the sequence has a different
  // length per delivery mode, so an index would point at a different screen the moment the mode
  // changed under it.
  const [stepKey, setStepKey] = useState<StepKey>('cart');
  const [notes, setNotes] = useState('');
  // Cash orders: the bill the customer will pay with ("¿con cuánto pagarás?"), so the merchant or
  // driver brings the right change. Kept as text while typing; empty means exact payment.
  const [payWith, setPayWith] = useState('');
  // How the order leaves the store. Pickup skips the envío entirely -- the customer rides, not us.
  const [deliveryMode, setDeliveryMode] = useState<'delivery' | 'pickup'>('delivery');
  // How it gets paid. Card is shown but not yet available, so cash is both the default and the
  // only enabled choice today; the state exists so enabling card later is a UI change alone.
  const [paymentType] = useState<'cash'>('cash');
  // The merchant's branches. A branch with no quadrant serves anywhere, which is how the catalogue
  // filter treats it too.
  const [offices, setOffices] = useState<api.MerchantOffice[]>([]);
  // Which branch fulfils this order. Chosen by the customer only when more than one could.
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  // What the customer calls the pre-filled address ("Casa"), so the step says which one it used.
  const [addressLabel, setAddressLabel] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [submitting, setSubmitting] = useState(false);
  const [mapKey, setMapKey] = useState(0); // bump to recenter the map on a new location
  const [locating, setLocating] = useState(false);

  // Pre-fill the location from the customer's default address, so the location step opens on where
  // they usually deliver instead of an empty map.
  //
  // The map is built once when LocationPicker mounts and ignores later prop changes -- remounting it
  // (bumping mapKey) is the only way to re-centre. Without that bump, a profile that arrives after
  // the step is already on screen fills the address box but leaves the map on the default centre,
  // which is the one case where "the default address" would not actually be applied.
  useEffect(() => {
    // A session location was chosen deliberately, minutes ago, from the home header -- it outranks
    // the saved default here for the same reason it does in the header. Without this the header
    // would promise one destination and the order would carry another.
    if (session.location) {
      setAddress(session.location.address);
      setAddressLabel(sessionLocationLabel());
      setCoords({ lat: session.location.latitude, lng: session.location.longitude });
      if (session.location.latitude != null) setMapKey((k) => k + 1);
      return;
    }
    // Guests have no profile to pre-fill from; the map simply opens uncentred for them.
    if (!token) return;
    api.me().then((res) => {
      if (!res.success || !res.data) return;
      setAddress(res.data.address ?? '');
      setAddressLabel(res.data.addressLabel ?? null);
      setCoords({ lat: res.data.latitude ?? null, lng: res.data.longitude ?? null });
      if (res.data.latitude != null && res.data.longitude != null) setMapKey((k) => k + 1);
    });
  }, []);

  // Fetched once per merchant. Their quadrants are drawn on the picker, which refuses a pin outside
  // them, so the customer cannot choose somewhere the merchant would then have to reject.
  useEffect(() => {
    if (!cart.merchantId) { setOffices([]); setOfficeId(null); return; }
    let active = true;
    api.merchantOffices(cart.merchantId).then((res) => {
      if (active && res.success) setOffices(res.data ?? []);
    });
    return () => { active = false; };
  }, [cart.merchantId]);

  // Branches that could take an order to where the customer currently is. The pre-filled point is
  // their saved address or session pin -- the same one the catalogue was filtered by.
  const eligible = offices.filter((o) => api.officeCovers(o, coords.lat, coords.lng));

  // Nothing to ask when only one branch can serve the point: choosing for them is not a decision,
  // it is a formality. Only set while none is chosen, so moving the pin later cannot silently
  // reassign the branch out from under a choice already made.
  useEffect(() => {
    if (officeId || eligible.length !== 1) return;
    setOfficeId(eligible[0].id);
  }, [officeId, eligible.length]);

  const selectedOffice = offices.find((o) => o.id === officeId) ?? null;

  // The chosen branch as the route's start: the location step draws office -> pin and redraws it
  // on every new pick. Null (no route) while no branch is chosen or it has no pin of its own.
  const routeOrigin = selectedOffice && selectedOffice.latitude != null && selectedOffice.longitude != null
    ? { lat: selectedOffice.latitude, lng: selectedOffice.longitude, title: selectedOffice.name }
    : null;

  // Driving distance/time branch -> chosen point, shown on the summary. Follows the pin: it
  // re-resolves whenever the coordinates change, and hides while unknown.
  const eta = useRouteEta(routeOrigin?.lat, routeOrigin?.lng, coords.lat, coords.lng);

  // What the delivery costs for that route. Null while the distance is unknown, in which case the
  // summary says so and the footer total stays products-only rather than showing a wrong number.
  // Pickup charges no envío at all: the customer collects the order themselves.
  const deliveryFee = deliveryMode === 'delivery' && eta ? deliveryFeeRd(eta.distanceM) : null;

  // The cash question's arithmetic. Valid when empty (exact payment) or covering the total; the
  // change previews live so the customer sees what the courier will owe them before ordering.
  const grandTotal = cart.total + (deliveryFee ?? 0);
  const payWithNum = payWith.trim() === '' ? null : Number(payWith.trim());
  const payWithValid = payWithNum == null || (Number.isFinite(payWithNum) && payWithNum >= grandTotal);
  const changeDue = payWithNum != null && payWithValid ? payWithNum - grandTotal : null;

  // The step exists only when there is a real choice to make.
  const needsOfficeChoice = !officeId && eligible.length > 1;

  // The wizard's shape, which the delivery mode decides (see checkoutSteps). The mode is chosen on
  // 'details', which comes before the step pickup drops, so the sequence can never change while
  // standing on one it no longer contains -- and indexOf is floored anyway, so a key that somehow
  // fell out of the sequence lands back on the cart rather than on nothing.
  const steps = stepsFor(deliveryMode);
  const stepIndex = Math.max(0, steps.indexOf(stepKey));
  const goNext = () => {
    // Reviewing the cart is open to guests; ORDERING is account-based (guideline 5.1.1). The
    // moment a guest tries to move past the review step, the popup asks them to sign in or create
    // an account -- and cancelling leaves them on the review, cart intact (it lives in memory
    // above the navigator, so it also survives the trip through login).
    if (!token && stepKey === 'cart') { promptLogin(); return; }
    // A signed-in account that skipped the completion form ("Ahora no, quiero explorar") is
    // brought back to it HERE, where the phone and address are genuinely needed -- an order
    // cannot be delivered without them.
    if (token && profileComplete === false && stepKey === 'cart') { router.push('/complete-profile'); return; }
    setStepKey(steps[Math.min(steps.length - 1, stepIndex + 1)]);
  };
  const goBack = () => setStepKey(steps[Math.max(0, stepIndex - 1)]);

  // Once a branch is chosen the map shows only its area: the union of every branch's would let the
  // customer place a pin the chosen one cannot reach.
  const areas: DeliveryArea[] = (selectedOffice ? [selectedOffice] : offices)
    // An office with a polygon always carries its bounding box too (derived on save), so the
    // rectangle filter still recognizes every area-bearing office.
    .filter((o) => o.minLatitude != null && o.maxLatitude != null
      && o.minLongitude != null && o.maxLongitude != null)
    .map((o) => ({
      minLatitude: o.minLatitude as number,
      maxLatitude: o.maxLatitude as number,
      minLongitude: o.minLongitude as number,
      maxLongitude: o.maxLongitude as number,
      polygon: o.polygon ?? null,
      officeName: o.name,
      latitude: o.latitude,
      longitude: o.longitude,
    }));

  // Whether a point may be ordered to. Mirrors the map's own check so "Mi ubicación" and a
  // pre-filled saved address are held to the same rule as a tap: the polygon when the office drew
  // one, the rectangle otherwise.
  const insideArea = (lat: number | null, lng: number | null): boolean => {
    if (!areas.length) return true;
    if (lat == null || lng == null) return false;
    return areas.some((a) => (a.polygon && a.polygon.length >= 3)
      ? pointInPolygon(a.polygon, lat, lng)
      : lat >= a.minLatitude && lat <= a.maxLatitude
        && lng >= a.minLongitude && lng <= a.maxLongitude);
  };

  const outsideNotice = () => Alert.alert(
    tx.outsideTitle,
    tx.outsideBody,
  );

  // Device GPS, then a readable address for it -- the same shared helper the sign-up and
  // profile-completion location steps use, so all three geocode identically.
  const useMyLocation = async () => {
    setLocating(true);
    const result = await detectCurrentLocation();
    setLocating(false);
    if (!result.ok) {
      if (result.reason === 'permission') {
        Alert.alert(tx.locPermTitle, tx.locPermBody);
      } else {
        Alert.alert(tx.locTitle, tx.locFailed);
      }
      return;
    }
    setCoords({ lat: result.location.lat, lng: result.location.lng });
    setAddressLabel(null);
    setMapKey((k) => k + 1);
    if (result.location.address) setAddress(result.location.address);
  };

  const placeOrder = async () => {
    setSubmitting(true);
    const res = await api.createOrder({
      items: cart.lines.map((l) => ({ itemId: l.product.id, quantity: l.quantity })),
      notes: notes.trim() || undefined,
      address: address.trim() || undefined,
      latitude: coords.lat,
      longitude: coords.lng,
      officeId: officeId ?? undefined,
      // The measured route distance; the server rebuilds the fee from it with its own tariff.
      // Withheld on pickup so no fee is computed for an order nobody rides.
      deliveryDistanceM: deliveryMode === 'delivery' && eta ? Math.round(eta.distanceM) : undefined,
      deliveryMode,
      paymentType,
      // Only a real overpayment travels: exact/empty stays undefined, and the server re-checks
      // the amount against ITS total anyway.
      cashPayWith: paymentType === 'cash' && payWithNum != null && payWithValid && payWithNum > 0
        ? payWithNum
        : undefined,
    });
    setSubmitting(false);
    if (!res.success) { Alert.alert(tx.orderFailedTitle, res.message); return; }
    const orderId = res.data.id;
    cart.clear();
    // Straight to the tracking screen for the new order.
    router.replace(`/order/${orderId}`);
  };

  if (cart.lines.length === 0) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title={tx.yourOrder} onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={styles.center}>
          {/* The emoji sat loose on the gradient at 48px, which read as a stray character. Inside a
              glass disc it becomes an illustration, matching the surfaces used everywhere else. */}
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyEmoji}>🛒</Text>
          </View>
          <Text style={styles.emptyTitle}>{tx.emptyTitle}</Text>
          <Text style={styles.emptySubtitle}>
            {tx.emptySubtitle}
          </Text>
          {/* Sized to its own text rather than stretched edge to edge: the footer's full-width
              button means "finish this", and nothing is being finished on an empty cart. */}
          <Pressable
            style={({ pressed }) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
            onPress={() => router.replace('/explore')}
            accessibilityRole="button"
          >
            <FontAwesome5 name="store" size={14} solid color={t.onAccent} />
            <Text style={styles.emptyCtaText}>{tx.exploreMerchants}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header
        title={needsOfficeChoice ? tx.branch : stepTitles()[stepKey]}
        onBack={() => (needsOfficeChoice || stepIndex === 0
          ? (router.canGoBack() ? router.back() : router.replace('/home'))
          : goBack())}
      />
      {!needsOfficeChoice ? <Stepper steps={steps} current={stepIndex} /> : null}

      {/* Branch selection: shown only when more than one of the merchant's branches covers where the
          order is going. With one there is nothing to decide, and it is chosen automatically. The
          list is numbered to match the pins on the map below it, so "Sucursal 2" is a place, not
          just a name. */}
      {needsOfficeChoice && (
        <View style={styles.officeStep}>
          <ScrollView style={styles.officeList} contentContainerStyle={styles.scroll}>
            <Text style={styles.merchant}>{cart.merchantName}</Text>
            <Text style={styles.officeLead}>
              {tx.branchLead}
            </Text>
            {eligible.map((o, i) => (
              <Pressable
                key={o.id}
                style={styles.officeCard}
                onPress={() => setOfficeId(o.id)}
                accessibilityRole="button"
              >
                <View style={styles.officeNum}><Text style={styles.officeNumText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.officeName}>{o.name}</Text>
                  {o.address ? <Text style={styles.officeAddress} numberOfLines={2}>{o.address}</Text> : null}
                </View>
                <Text style={styles.officeChevron}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* The same branches as pins. Keyed by the branch list because the map builds its HTML
              once on mount and would otherwise keep showing a stale set. */}
          {eligible.some((o) => o.latitude != null || o.address) ? (
            <View style={styles.officeMap}>
              <PointsMap
                key={eligible.map((o) => o.id).join(',')}
                points={eligible.map((o, i) => ({
                  lat: o.latitude, lng: o.longitude, address: o.address,
                  label: String(i + 1), title: o.name, color: '#0b2a6b',
                }))}
              />
            </View>
          ) : null}
        </View>
      )}

      {!needsOfficeChoice && stepKey === 'cart' && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.merchant}>{cart.merchantName}</Text>
            {cart.lines.map((l) => (
              <View key={l.product.id} style={styles.line}>
                {/* The item's own photo when the merchant set one; the category icon stands in
                    for the ones that have none -- the same convention as the marketplace tiles. */}
                <View style={styles.lineThumb}>
                  {l.product.imageUrl ? (
                    <Image source={{ uri: l.product.imageUrl }} style={styles.lineThumbImage} resizeMode="contain" />
                  ) : (
                    <Text style={styles.lineThumbEmoji}>{emojiFor(l.product.categories?.[0] ?? l.product.companyName)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={1}>{l.product.name}</Text>
                  <Text style={styles.linePrice}>{money(l.product.price)}</Text>
                </View>
                <View style={styles.qtyCtrl}>
                  <Pressable style={styles.stepBtn} onPress={() => cart.setQuantity(l.product.id, l.quantity - 1)}><Text style={styles.stepText}>−</Text></Pressable>
                  <Text style={styles.qty}>{l.quantity}</Text>
                  <Pressable style={styles.stepBtn} onPress={() => cart.setQuantity(l.product.id, l.quantity + 1)}><Text style={styles.stepText}>+</Text></Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <Footer total={cart.total}>
            <Pressable style={styles.primary} onPress={goNext}><Text style={styles.primaryText}>{tx.continueLabel}</Text></Pressable>
          </Footer>
        </>
      )}

      {/* Step 2 -- the order's details: how it leaves the store and how it gets paid. Answered
          before the map, because "retiro en tienda" removes the location step altogether. Card is
          offered but disabled until it actually works; showing it dead is honest about what is
          coming without letting anyone pick a payment that cannot happen. */}
      {!needsOfficeChoice && stepKey === 'details' && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>{tx.deliveryMode}</Text>
            <Pressable
              style={[styles.optionCard, deliveryMode === 'delivery' && styles.optionActive]}
              onPress={() => setDeliveryMode('delivery')}
              accessibilityRole="button"
            >
              <Text style={styles.optionIcon}>🛵</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{tx.deliveryTitle}</Text>
                <Text style={styles.optionSub}>{tx.deliverySub}</Text>
              </View>
              <View style={[styles.radio, deliveryMode === 'delivery' && styles.radioActive]}>
                {deliveryMode === 'delivery' ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
            <Pressable
              style={[styles.optionCard, deliveryMode === 'pickup' && styles.optionActive]}
              onPress={() => setDeliveryMode('pickup')}
              accessibilityRole="button"
            >
              <Text style={styles.optionIcon}>🏪</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{tx.pickupTitle}</Text>
                <Text style={styles.optionSub}>{tx.pickupSub}</Text>
              </View>
              <View style={[styles.radio, deliveryMode === 'pickup' && styles.radioActive]}>
                {deliveryMode === 'pickup' ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>

            <Text style={styles.label}>{tx.paymentMethod}</Text>
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
          </ScrollView>
          <Footer total={cart.total}>
            <Pressable style={styles.primary} onPress={goNext}><Text style={styles.primaryText}>{tx.continueLabel}</Text></Pressable>
          </Footer>
        </>
      )}

      {/* Step 3 -- where it goes. Delivery only: reached by goNext() from the details, which on
          pickup lands on the note instead. */}
      {!needsOfficeChoice && stepKey === 'location' && (
        <View style={styles.mapStep}>
          <View style={styles.locRow}>
            <Text style={styles.hint}>
              {areas.length > 0
                ? tx.tapInsideArea
                : tx.tapMap}
            </Text>
            <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
              {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>{tx.myLocation}</Text>}
            </Pressable>
          </View>
          <LocationPicker
            key={mapKey}
            latitude={coords.lat ?? DEFAULT_CENTER.lat}
            longitude={coords.lng ?? DEFAULT_CENTER.lng}
            areas={areas}
            origin={routeOrigin}
            onOutside={outsideNotice}
            // Picking a point makes this somewhere else, so it is no longer the saved address.
            onPick={(loc) => {
              setCoords({ lat: loc.lat, lng: loc.lng });
              setAddressLabel(null);
              if (loc.address) setAddress(loc.address);
            }}
          />
          {areas.length > 0 ? (
            <View style={styles.legend}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>
                {areas[0].officeName ?? cart.merchantName ?? tx.theMerchant}
                {areas.length > 1 ? tx.moreBranches(areas.length - 1) : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.labelRow}>
            <Text style={styles.labelText}>{tx.deliveryAddress}</Text>
            {addressLabel ? <Text style={styles.labelBadge}>{addressLabel}</Text> : null}
          </View>
          <TextInput style={styles.addressInput} value={address} onChangeText={setAddress} placeholder={tx.deliveryAddress} placeholderTextColor={t.textFaint} multiline />
          {/* A saved address or a GPS fix can land outside the area without any tap being refused,
              so the step is gated on the point itself rather than only on the map's own check. */}
          {areas.length > 0 && !insideArea(coords.lat, coords.lng) ? (
            <Text style={styles.outsideWarn}>
              {tx.outsideWarn(cart.merchantName ?? tx.thisMerchant)}
            </Text>
          ) : null}
          <Pressable
            style={[styles.primary, (!address.trim() || !insideArea(coords.lat, coords.lng)) && styles.disabled]}
            disabled={!address.trim() || !insideArea(coords.lat, coords.lng)}
            onPress={goNext}
          >
            <Text style={styles.primaryText}>{tx.continueLabel}</Text>
          </Pressable>
        </View>
      )}

      {!needsOfficeChoice && stepKey === 'note' && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>{tx.notesLabel}</Text>
            <TextInput style={styles.notes} value={notes} onChangeText={setNotes} placeholder={tx.notesPlaceholder} placeholderTextColor={t.textFaint} multiline />

            {/* Cash only: with what bill will they pay, so whoever hands the order over brings the
                change. Empty is fine -- it reads as exact payment. */}
            {paymentType === 'cash' ? (
              <>
                <Text style={styles.label}>{tx.payWithLabel}</Text>
                <TextInput
                  style={styles.payWithInput}
                  value={payWith}
                  onChangeText={setPayWith}
                  placeholder={tx.payWithPlaceholder(money(grandTotal))}
                  placeholderTextColor={t.textFaint}
                  keyboardType="numeric"
                />
                {payWithNum != null && !payWithValid ? (
                  <Text style={styles.payWithError}>
                    {tx.payWithError(money(grandTotal))}
                  </Text>
                ) : changeDue != null && changeDue > 0 ? (
                  <Text style={styles.payWithChange}>{tx.changeDue(money(changeDue))}</Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
          <Footer total={cart.total}>
            <Pressable
              style={[styles.primary, !payWithValid && styles.disabled]}
              onPress={goNext}
              disabled={!payWithValid}
            >
              <Text style={styles.primaryText}>{tx.continueLabel}</Text>
            </Pressable>
          </Footer>
        </>
      )}

      {!needsOfficeChoice && stepKey === 'summary' && (
        <>
          {/* Map on top: where it is going, or -- on pickup, which never picked a delivery point --
              where it is collected. Showing the delivery picker there would offer a pin the order
              does not have, on a step that only reviews. */}
          <View style={styles.reviewMap}>
            {deliveryMode === 'delivery' ? (
              <LocationPicker
                latitude={coords.lat ?? DEFAULT_CENTER.lat}
                longitude={coords.lng ?? DEFAULT_CENTER.lng}
                areas={areas}
                origin={routeOrigin}
                onOutside={outsideNotice}
                onPick={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.address) setAddress(loc.address); }}
              />
            ) : (
              <PointsMap
                points={[{
                  lat: selectedOffice?.latitude ?? null,
                  lng: selectedOffice?.longitude ?? null,
                  address: selectedOffice?.address ?? null,
                  // A lone pin needs no number on it, unlike the numbered branch chooser.
                  label: '🏪',
                  title: selectedOffice?.name ?? cart.merchantName ?? tx.theMerchant,
                  color: '#0b2a6b',
                }]}
              />
            )}
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* What was chosen on the details step, echoed so the review really reviews it. */}
            <Text style={styles.label}>{tx.detailsLabel}</Text>
            <View style={styles.addrCard}>
              <Text style={styles.pin}>{deliveryMode === 'delivery' ? '🛵' : '🏪'}</Text>
              <Text style={styles.addrText}>
                {deliveryMode === 'delivery' ? tx.deliveryTitle : tx.pickupTitle}{tx.cashPaymentSuffix}
                {changeDue != null && changeDue > 0
                  ? tx.payingWithSuffix(money(payWithNum!), money(changeDue))
                  : ''}
              </Text>
            </View>

            <Text style={styles.label}>{deliveryMode === 'delivery' ? tx.deliverAt : tx.pickUpAt}</Text>
            <View style={styles.addrCard}>
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.addrText}>
                  {deliveryMode === 'delivery'
                    ? (address || tx.noAddress)
                    : (selectedOffice?.address ?? selectedOffice?.name ?? cart.merchantName ?? tx.theMerchant)}
                </Text>
                {deliveryMode === 'delivery' && eta ? (
                  <Text style={styles.etaText}>
                    {tx.etaFrom(formatEta(eta), selectedOffice?.name ?? tx.fromMerchantFallback)}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* …the products in the middle… */}
            <Text style={styles.label}>{tx.productsAt(cart.merchantName)}</Text>
            {cart.lines.map((l) => (
              <View key={l.product.id} style={styles.reviewLine}>
                <Text style={styles.reviewQty}>{l.quantity}×</Text>
                <Text style={styles.reviewName} numberOfLines={1}>{l.product.name}</Text>
                <Text style={styles.reviewPrice}>{money(l.quantity * l.product.price)}</Text>
              </View>
            ))}

            {/* …the delivery cost for the route about to be driven (or none, on pickup)… */}
            <Text style={styles.label}>{tx.shippingLabel}</Text>
            <View style={styles.reviewLine}>
              <Text style={styles.reviewName}>
                {deliveryMode === 'pickup'
                  ? tx.pickupNoShipping
                  : deliveryFee != null && eta
                    ? tx.homeDelivery(formatEta(eta))
                    : tx.feePending}
              </Text>
              {deliveryFee != null ? <Text style={styles.reviewPrice}>{money(deliveryFee)}</Text> : null}
            </View>

            {/* …and the note at the bottom. */}
            <Text style={styles.label}>{tx.noteLabel}</Text>
            <View style={styles.noteCard}><Text style={styles.noteText}>{notes.trim() || tx.noNote}</Text></View>
          </ScrollView>
          <Footer total={cart.total + (deliveryFee ?? 0)}>
            <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={placeOrder} disabled={submitting}>
              {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.primaryText}>{tx.placeOrderLabel}</Text>}
            </Pressable>
          </Footer>
        </>
      )}
    </SafeAreaView>
    </GradientBackground>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <Text style={styles.title}>{title}</Text>
      <View style={{ width: BACK_BUTTON_WIDTH }} />
    </View>
  );
}

// Driven by the sequence in force, not a fixed list: a pickup order really has four steps, and a
// stepper still promising five would count down to one that never arrives.
function Stepper({ steps, current }: { steps: StepKey[]; current: number }) {
  const titles = stepTitles();
  return (
    <View style={styles.stepperRow}>
      {steps.map((key, i) => {
        const label = titles[key];
        const n = i + 1;
        const active = i === current;
        const done = i < current;
        return (
          <View key={key} style={styles.stepItem}>
            <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
              <Text style={[styles.stepDotText, (active || done) && { color: t.onAccent }]}>{done ? '✓' : n}</Text>
            </View>
            <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Footer({ total, children }: { total: number; children: ReactNode }) {
  const tx = useStrings(S);
  return (
    <View style={styles.footer}>
      <View style={styles.totalRow}><Text style={styles.totalLabel}>{tx.total}</Text><Text style={styles.totalValue}>{money(total)}</Text></View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },

  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: t.accent },
  stepDotText: { fontSize: 13, fontWeight: '800', color: t.text },
  stepLabel: { fontSize: 12, color: t.textFaint, fontWeight: '600' },
  stepLabelActive: { color: t.text, fontWeight: '800' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyBadge: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: t.text, marginTop: 18 },
  // Capped so the sentence breaks into two balanced lines instead of one edge-to-edge run.
  emptySubtitle: {
    fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 20,
    marginTop: 6, maxWidth: 260,
  },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 24,
    backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13,
    ...(Platform.OS === 'web' ? { boxShadow: '0 6px 18px rgba(0,0,0,0.28)' as any } : { elevation: 4 }),
  },
  emptyCtaPressed: { opacity: 0.85 },
  emptyCtaText: { color: t.onAccent, fontSize: 15, fontWeight: '900' },

  scroll: { padding: 16 },
  merchant: { fontSize: 18, fontWeight: '800', color: t.text, marginBottom: 12 },
  line: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, marginBottom: 10, gap: 12 },
  lineThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: t.cardStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  lineThumbImage: { width: '100%', height: '100%' },
  lineThumbEmoji: { fontSize: 22 },
  lineName: { fontSize: 15, fontWeight: '700', color: t.text },
  linePrice: { fontSize: 14, fontWeight: '800', color: t.text, marginTop: 4 },
  qtyCtrl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
  stepText: { color: t.text, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  qty: { fontSize: 16, fontWeight: '800', color: t.text, minWidth: 20, textAlign: 'center' },

  // Step 2 (details): delivery-mode and payment option cards.
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

  mapStep: { flex: 1, padding: 16 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  officeLead: { fontSize: 14, color: t.textMuted, lineHeight: 20, marginBottom: 14 },
  officeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14,
    padding: 14, marginBottom: 10,
  },
  officeStep: { flex: 1 },
  // The list sizes to its cards (capped so a long branch list cannot squeeze the map away);
  // the map takes everything left.
  officeList: { flexGrow: 0, maxHeight: '45%' },
  officeMap: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, overflow: 'hidden' },
  // Matches the numbered pin drawn for the same branch on the map below.
  officeNum: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#0b2a6b',
    borderWidth: 2, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  officeNumText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  officeName: { fontSize: 15, fontWeight: '800', color: t.text },
  officeAddress: { fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 },
  officeChevron: { fontSize: 22, color: t.textFaint, fontWeight: '300' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  // Matches the office marker drawn on the map, so the dot is identifiable rather than mysterious.
  legendDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#0b2a6b', borderWidth: 2, borderColor: '#ffffff' },
  legendText: { flex: 1, fontSize: 12, color: t.textMuted, fontWeight: '600' },
  // Says why Continuar is disabled; without it the button just looks broken.
  outsideWarn: { color: t.danger, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  hint: { flex: 1, fontSize: 14, color: t.textMuted, fontWeight: '600' },
  locBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 118, alignItems: 'center' },
  locBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },
  label: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: 12, marginBottom: 6 },
  // Same row rhythm as `label`, for the one place the label sits beside a badge.
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6 },
  labelText: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  // Names the saved address the step opened with; disappears once a different point is chosen.
  labelBadge: {
    fontSize: 12, fontWeight: '800', color: t.text, backgroundColor: t.cardStrong,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden',
  },
  addressInput: { backgroundColor: t.card, borderRadius: 12, padding: 14, minHeight: 56, fontSize: 15, color: t.text, textAlignVertical: 'top', borderWidth: 1, borderColor: t.border },

  addrCard: { flexDirection: 'row', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 16 },
  addrText: { fontSize: 15, color: t.text, fontWeight: '600' },
  etaText: { fontSize: 13, color: t.textMuted, fontWeight: '700', marginTop: 6 },
  notes: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, minHeight: 70, fontSize: 15, color: t.text, textAlignVertical: 'top' },
  // The cash question: a one-line numeric box (the notes style is a tall multiline), with live
  // feedback below -- red when the amount cannot cover the order, green when it resolves into a
  // concrete devuelta.
  payWithInput: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text },
  payWithError: { color: t.danger, fontSize: 13, fontWeight: '700', marginTop: 6 },
  payWithChange: { color: t.success, fontSize: 14, fontWeight: '800', marginTop: 6 },

  // Step 4 (review)
  reviewMap: { height: 200, marginHorizontal: 16, marginTop: 14, borderRadius: 12, overflow: 'hidden' },
  reviewLine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
  reviewQty: { fontSize: 14, fontWeight: '800', color: t.text, minWidth: 28 },
  reviewName: { flex: 1, fontSize: 15, fontWeight: '600', color: t.text },
  reviewPrice: { fontSize: 14, fontWeight: '800', color: t.text },
  noteCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14 },
  noteText: { fontSize: 15, color: t.text },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: t.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: t.textMuted },
  totalValue: { fontSize: 22, fontWeight: '800', color: t.text },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
