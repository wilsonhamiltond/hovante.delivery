import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useCart } from '../src/cart';
import * as api from '../src/api';
import { formatEta, useRouteEta } from '../src/eta';
import { deliveryFeeRd } from '../src/deliveryFee';
import { LocationPicker } from '../src/LocationPicker';
import { PointsMap } from '../src/PointsMap';
import { DEFAULT_CENTER, type DeliveryArea } from '../src/mapHtml';
import { detectCurrentLocation } from '../src/profileForm';
import { SESSION_LOCATION_LABEL, useSessionLocation } from '../src/sessionLocation';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';

const money = (n: number) => `RD$${n.toFixed(2)}`;
const STEPS = ['Carrito', 'Ubicación', 'Nota', 'Resumen'];

// Checkout wizard: 1) review the cart, 2) pick the delivery location on a map, 3) add a note and
// place the order.
export default function CartScreen() {
  const router = useRouter();
  const cart = useCart();
  const session = useSessionLocation();
  const [step, setStep] = useState(1);
  const [notes, setNotes] = useState('');
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
      setAddressLabel(SESSION_LOCATION_LABEL);
      setCoords({ lat: session.location.latitude, lng: session.location.longitude });
      if (session.location.latitude != null) setMapKey((k) => k + 1);
      return;
    }
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
  const deliveryFee = eta ? deliveryFeeRd(eta.distanceM) : null;

  // The step exists only when there is a real choice to make.
  const needsOfficeChoice = !officeId && eligible.length > 1;

  // Once a branch is chosen the map shows only its area: the union of every branch's would let the
  // customer place a pin the chosen one cannot reach.
  const areas: DeliveryArea[] = (selectedOffice ? [selectedOffice] : offices)
    .filter((o) => o.minLatitude != null && o.maxLatitude != null
      && o.minLongitude != null && o.maxLongitude != null)
    .map((o) => ({
      minLatitude: o.minLatitude as number,
      maxLatitude: o.maxLatitude as number,
      minLongitude: o.minLongitude as number,
      maxLongitude: o.maxLongitude as number,
      officeName: o.name,
      latitude: o.latitude,
      longitude: o.longitude,
    }));

  // Whether a point may be ordered to. Mirrors the map's own check so "Mi ubicación" and a
  // pre-filled saved address are held to the same rule as a tap.
  const insideArea = (lat: number | null, lng: number | null): boolean => {
    if (!areas.length) return true;
    if (lat == null || lng == null) return false;
    return areas.some((a) => lat >= a.minLatitude && lat <= a.maxLatitude
      && lng >= a.minLongitude && lng <= a.maxLongitude);
  };

  const outsideNotice = () => Alert.alert(
    'Fuera del área de entrega',
    'Este comercio solo entrega dentro del área marcada en el mapa. Elige un punto dentro del recuadro.',
  );

  // Device GPS, then a readable address for it -- the same shared helper the sign-up and
  // profile-completion location steps use, so all three geocode identically.
  const useMyLocation = async () => {
    setLocating(true);
    const result = await detectCurrentLocation();
    setLocating(false);
    if (!result.ok) {
      if (result.reason === 'permission') {
        Alert.alert('Permiso de ubicación', 'Activa el permiso de ubicación para usar tu ubicación actual.');
      } else {
        Alert.alert('Ubicación', 'No se pudo obtener tu ubicación actual.');
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
      deliveryDistanceM: eta ? Math.round(eta.distanceM) : undefined,
    });
    setSubmitting(false);
    if (!res.success) { Alert.alert('No se pudo crear el pedido', res.message); return; }
    const orderId = res.data.id;
    cart.clear();
    // Straight to the tracking screen for the new order.
    router.replace(`/order/${orderId}`);
  };

  if (cart.lines.length === 0) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title="Tu pedido" onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={styles.center}>
          {/* The emoji sat loose on the gradient at 48px, which read as a stray character. Inside a
              glass disc it becomes an illustration, matching the surfaces used everywhere else. */}
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyEmoji}>🛒</Text>
          </View>
          <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
          <Text style={styles.emptySubtitle}>
            Agrega productos de tus comercios favoritos y los verás aquí.
          </Text>
          {/* Sized to its own text rather than stretched edge to edge: the footer's full-width
              button means "finish this", and nothing is being finished on an empty cart. */}
          <Pressable
            style={({ pressed }) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
            onPress={() => router.replace('/explore')}
            accessibilityRole="button"
          >
            <FontAwesome5 name="store" size={14} solid color={t.onAccent} />
            <Text style={styles.emptyCtaText}>Explorar comercios</Text>
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
        title={needsOfficeChoice ? 'Sucursal' : STEPS[step - 1]}
        onBack={() => (needsOfficeChoice || step === 1
          ? (router.canGoBack() ? router.back() : router.replace('/home'))
          : setStep(step - 1))}
      />
      {!needsOfficeChoice ? <Stepper step={step} /> : null}

      {/* Branch selection: shown only when more than one of the merchant's branches covers where the
          order is going. With one there is nothing to decide, and it is chosen automatically. The
          list is numbered to match the pins on the map below it, so "Sucursal 2" is a place, not
          just a name. */}
      {needsOfficeChoice && (
        <View style={styles.officeStep}>
          <ScrollView style={styles.officeList} contentContainerStyle={styles.scroll}>
            <Text style={styles.merchant}>{cart.merchantName}</Text>
            <Text style={styles.officeLead}>
              Varias sucursales entregan en tu ubicación. Elige desde cuál quieres tu pedido.
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

      {!needsOfficeChoice && step === 1 && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.merchant}>{cart.merchantName}</Text>
            {cart.lines.map((l) => (
              <View key={l.product.id} style={styles.line}>
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
            <Pressable style={styles.primary} onPress={() => setStep(2)}><Text style={styles.primaryText}>Continuar</Text></Pressable>
          </Footer>
        </>
      )}

      {!needsOfficeChoice && step === 2 && (
        <View style={styles.mapStep}>
          <View style={styles.locRow}>
            <Text style={styles.hint}>
              {areas.length > 0
                ? 'Toca dentro del área marcada para elegir dónde entregar'
                : 'Toca el mapa para elegir dónde entregar'}
            </Text>
            <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
              {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>📍 Mi ubicación</Text>}
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
                {areas[0].officeName ?? cart.merchantName ?? 'El comercio'}
                {areas.length > 1 ? ` y ${areas.length - 1} sucursal(es) más` : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.labelRow}>
            <Text style={styles.labelText}>Dirección de entrega</Text>
            {addressLabel ? <Text style={styles.labelBadge}>{addressLabel}</Text> : null}
          </View>
          <TextInput style={styles.addressInput} value={address} onChangeText={setAddress} placeholder="Dirección de entrega" placeholderTextColor={t.textFaint} multiline />
          {/* A saved address or a GPS fix can land outside the area without any tap being refused,
              so the step is gated on the point itself rather than only on the map's own check. */}
          {areas.length > 0 && !insideArea(coords.lat, coords.lng) ? (
            <Text style={styles.outsideWarn}>
              Este punto está fuera del área de entrega de {cart.merchantName ?? 'este comercio'}.
              Elige uno dentro del recuadro.
            </Text>
          ) : null}
          <Pressable
            style={[styles.primary, (!address.trim() || !insideArea(coords.lat, coords.lng)) && styles.disabled]}
            disabled={!address.trim() || !insideArea(coords.lat, coords.lng)}
            onPress={() => setStep(3)}
          >
            <Text style={styles.primaryText}>Continuar</Text>
          </Pressable>
        </View>
      )}

      {!needsOfficeChoice && step === 3 && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>Notas para el comercio</Text>
            <TextInput style={styles.notes} value={notes} onChangeText={setNotes} placeholder="Ej: sin cebolla, tocar el timbre…" placeholderTextColor={t.textFaint} multiline />
          </ScrollView>
          <Footer total={cart.total}>
            <Pressable style={styles.primary} onPress={() => setStep(4)}><Text style={styles.primaryText}>Continuar</Text></Pressable>
          </Footer>
        </>
      )}

      {!needsOfficeChoice && step === 4 && (
        <>
          {/* Map with the selected location on top… */}
          <View style={styles.reviewMap}>
            <LocationPicker
              latitude={coords.lat ?? DEFAULT_CENTER.lat}
              longitude={coords.lng ?? DEFAULT_CENTER.lng}
              areas={areas}
              origin={routeOrigin}
              onOutside={outsideNotice}
              onPick={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.address) setAddress(loc.address); }}
            />
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>Entregar en</Text>
            <View style={styles.addrCard}>
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.addrText}>{address || 'Sin dirección'}</Text>
                {eta ? (
                  <Text style={styles.etaText}>
                    ⏱️ {formatEta(eta)} desde {selectedOffice?.name ?? 'el comercio'}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* …the products in the middle… */}
            <Text style={styles.label}>Productos · {cart.merchantName}</Text>
            {cart.lines.map((l) => (
              <View key={l.product.id} style={styles.reviewLine}>
                <Text style={styles.reviewQty}>{l.quantity}×</Text>
                <Text style={styles.reviewName} numberOfLines={1}>{l.product.name}</Text>
                <Text style={styles.reviewPrice}>{money(l.quantity * l.product.price)}</Text>
              </View>
            ))}

            {/* …the delivery cost for the route about to be driven… */}
            <Text style={styles.label}>Envío</Text>
            <View style={styles.reviewLine}>
              <Text style={styles.reviewName}>
                {deliveryFee != null && eta
                  ? `Entrega a domicilio · ${formatEta(eta)}`
                  : 'Se calcula al conocer la distancia'}
              </Text>
              {deliveryFee != null ? <Text style={styles.reviewPrice}>{money(deliveryFee)}</Text> : null}
            </View>

            {/* …and the note at the bottom. */}
            <Text style={styles.label}>Nota</Text>
            <View style={styles.noteCard}><Text style={styles.noteText}>{notes.trim() || 'Sin nota'}</Text></View>
          </ScrollView>
          <Footer total={cart.total + (deliveryFee ?? 0)}>
            <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={placeOrder} disabled={submitting}>
              {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.primaryText}>Realizar pedido</Text>}
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

function Stepper({ step }: { step: number }) {
  return (
    <View style={styles.stepperRow}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <View key={label} style={styles.stepItem}>
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
  return (
    <View style={styles.footer}>
      <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(total)}</Text></View>
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
  line: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  lineName: { fontSize: 15, fontWeight: '700', color: t.text },
  linePrice: { fontSize: 14, fontWeight: '800', color: t.text, marginTop: 4 },
  qtyCtrl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
  stepText: { color: t.text, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  qty: { fontSize: 16, fontWeight: '800', color: t.text, minWidth: 20, textAlign: 'center' },

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
