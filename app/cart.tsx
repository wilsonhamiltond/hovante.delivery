import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCart } from '../src/cart';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/leafletMap';
import { GradientBackground, t } from '../src/theme';

const money = (n: number) => `RD$${n.toFixed(2)}`;
const STEPS = ['Carrito', 'Ubicación', 'Nota', 'Resumen'];

// Checkout wizard: 1) review the cart, 2) pick the delivery location on a map, 3) add a note and
// place the order.
export default function CartScreen() {
  const router = useRouter();
  const cart = useCart();
  const [step, setStep] = useState(1);
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [submitting, setSubmitting] = useState(false);
  const [mapKey, setMapKey] = useState(0); // bump to recenter the map on a new location
  const [locating, setLocating] = useState(false);

  // Pre-fill the location from the customer's saved address so the map opens where they usually are.
  useEffect(() => {
    api.me().then((res) => {
      if (res.success && res.data) {
        setAddress(res.data.address ?? '');
        setCoords({ lat: res.data.latitude ?? null, lng: res.data.longitude ?? null });
      }
    });
  }, []);

  // Uses the device GPS (expo-location; browser geolocation on web) to set the delivery location,
  // recenter the map, and reverse-geocode a readable address.
  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso de ubicación', 'Activa el permiso de ubicación para usar tu ubicación actual.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });
      setMapKey((k) => k + 1);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`);
        const j = await r.json();
        if (j && j.display_name) setAddress(j.display_name);
      } catch { /* keep the existing address if reverse geocoding fails */ }
    } catch {
      Alert.alert('Ubicación', 'No se pudo obtener tu ubicación actual.');
    } finally {
      setLocating(false);
    }
  };

  const placeOrder = async () => {
    setSubmitting(true);
    const res = await api.createOrder({
      items: cart.lines.map((l) => ({ itemId: l.product.id, quantity: l.quantity })),
      notes: notes.trim() || undefined,
      address: address.trim() || undefined,
      latitude: coords.lat,
      longitude: coords.lng,
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
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyText}>Tu carrito está vacío</Text>
          <Pressable style={styles.primary} onPress={() => router.replace('/home')}>
            <Text style={styles.primaryText}>Explorar comercios</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title={STEPS[step - 1]} onBack={() => (step === 1 ? (router.canGoBack() ? router.back() : router.replace('/home')) : setStep(step - 1))} />
      <Stepper step={step} />

      {step === 1 && (
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

      {step === 2 && (
        <View style={styles.mapStep}>
          <View style={styles.locRow}>
            <Text style={styles.hint}>Toca el mapa para elegir dónde entregar</Text>
            <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
              {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>📍 Mi ubicación</Text>}
            </Pressable>
          </View>
          <LocationPicker
            key={mapKey}
            latitude={coords.lat ?? DEFAULT_CENTER.lat}
            longitude={coords.lng ?? DEFAULT_CENTER.lng}
            onPick={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.address) setAddress(loc.address); }}
          />
          <Text style={styles.label}>Dirección de entrega</Text>
          <TextInput style={styles.addressInput} value={address} onChangeText={setAddress} placeholder="Dirección de entrega" placeholderTextColor={t.textFaint} multiline />
          <Pressable style={[styles.primary, !address.trim() && styles.disabled]} disabled={!address.trim()} onPress={() => setStep(3)}>
            <Text style={styles.primaryText}>Continuar</Text>
          </Pressable>
        </View>
      )}

      {step === 3 && (
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

      {step === 4 && (
        <>
          {/* Map with the selected location on top… */}
          <View style={styles.reviewMap}>
            <LocationPicker
              latitude={coords.lat ?? DEFAULT_CENTER.lat}
              longitude={coords.lng ?? DEFAULT_CENTER.lng}
              onPick={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.address) setAddress(loc.address); }}
            />
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>Entregar en</Text>
            <View style={styles.addrCard}>
              <Text style={styles.pin}>📍</Text>
              <Text style={styles.addrText}>{address || 'Sin dirección'}</Text>
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

            {/* …and the note at the bottom. */}
            <Text style={styles.label}>Nota</Text>
            <View style={styles.noteCard}><Text style={styles.noteText}>{notes.trim() || 'Sin nota'}</Text></View>
          </ScrollView>
          <Footer total={cart.total}>
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
      <Pressable onPress={onBack} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={{ width: 56 }} />
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
  back: { color: t.text, fontWeight: '800', fontSize: 16, width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },

  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: t.accent },
  stepDotText: { fontSize: 13, fontWeight: '800', color: t.text },
  stepLabel: { fontSize: 12, color: t.textFaint, fontWeight: '600' },
  stepLabelActive: { color: t.text, fontWeight: '800' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 16, color: t.textMuted },

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
  hint: { flex: 1, fontSize: 14, color: t.textMuted, fontWeight: '600' },
  locBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 118, alignItems: 'center' },
  locBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },
  label: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: 12, marginBottom: 6 },
  addressInput: { backgroundColor: t.card, borderRadius: 12, padding: 14, minHeight: 56, fontSize: 15, color: t.text, textAlignVertical: 'top', borderWidth: 1, borderColor: t.border },

  addrCard: { flexDirection: 'row', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 16 },
  addrText: { flex: 1, fontSize: 15, color: t.text, fontWeight: '600' },
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
