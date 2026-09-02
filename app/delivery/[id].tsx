import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import * as api from '../../src/api';
import * as outbox from '../../src/outbox';
import type { Delivery } from '../../src/api';
import type { OutboxItem } from '../../src/outbox';
import { formatEta, useRouteEta } from '../../src/eta';
import { OrderMessages } from '../../src/OrderMessages';
import { OrderRatingCard } from '../../src/OrderRatingCard';
import { OrderRatingDialog } from '../../src/OrderRatingDialog';
import { GradientBackground, t } from '../../src/theme';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { useStrings, type Locale } from '../../src/i18n';

// Named by leg, matching Mi ruta: a claimed delivery is a ride to the merchant's office, and a
// started one is the ride to the customer. Same wording in both places so a driver reads one story.
const STATUS_COLORS: Record<string, string> = {
  PENDING: '#64748b',
  ASSIGNED: '#2563eb',
  IN_TRANSIT: '#d97706',
  DELIVERED: '#16a34a',
  FAILED: '#dc2626',
  RETURNED: '#dc2626',
  CANCELLED: '#94a3b8',
};

// The canonical values submitted to the API stay Spanish whatever the UI language, so the
// failureReason the merchant and customer later read is consistent; only the button label
// translates (see S.failReasons).
const FAIL_REASONS = ['Cliente ausente', 'Dirección incorrecta', 'Cliente rechazó el pedido', 'No se pudo contactar', 'Otro'];

const money = (n: number) => `RD$${n.toFixed(2)}`;

const S: Record<
  Locale,
  {
    status: Record<string, string>;
    failReasons: Record<string, string>;
    actionFailed: string;
    notFound: string;
    back: string;
    delivery: string;
    totalToCollect: string;
    paySub: (products: string, shipping: string) => string;
    pickupKind: string;
    merchant: string;
    mapBtn: string;
    pickupTitle: string;
    deliverKind: string;
    client: string;
    noAddress: string;
    deliverTitle: string;
    viewRoute: string;
    etaLabel: (eta: string) => string;
    notePrefix: string;
    receivedByPrefix: string;
    reasonPrefix: string;
    collected: string;
    collectedHint: string;
    markDelivered: string;
    markFailed: string;
    codeTitle: string;
    codeHint: string;
    confirmDelivery: string;
    cancel: string;
    failTitle: string;
    notesPlaceholder: string;
    confirmFail: string;
  }
> = {
  es: {
    status: {
      PENDING: 'Pendiente',
      ASSIGNED: 'Recoger en oficina',
      IN_TRANSIT: 'En camino al cliente',
      DELIVERED: 'Entregada',
      FAILED: 'Fallida',
      RETURNED: 'Devuelta',
      CANCELLED: 'Cancelada',
    },
    failReasons: {
      'Cliente ausente': 'Cliente ausente',
      'Dirección incorrecta': 'Dirección incorrecta',
      'Cliente rechazó el pedido': 'Cliente rechazó el pedido',
      'No se pudo contactar': 'No se pudo contactar',
      'Otro': 'Otro',
    },
    actionFailed: 'No se pudo completar la acción.',
    notFound: 'Entrega no encontrada.',
    back: 'Regresar',
    delivery: 'Entrega',
    totalToCollect: 'TOTAL A COBRAR',
    paySub: (products, shipping) => `Productos ${products} · Envío ${shipping}`,
    pickupKind: '1 · RECOGER EN',
    merchant: 'Comercio',
    mapBtn: '🗺️ Mapa',
    pickupTitle: 'Recoger',
    deliverKind: '2 · ENTREGAR A',
    client: 'Cliente',
    noAddress: 'Sin dirección',
    deliverTitle: 'Entregar',
    viewRoute: '🗺️  Ver ruta en el mapa',
    etaLabel: (eta) => `⏱️ Tiempo estimado: ${eta}`,
    notePrefix: 'Nota: ',
    receivedByPrefix: 'Recibido por: ',
    reasonPrefix: 'Motivo: ',
    collected: 'Recogí el pedido',
    collectedHint: 'Confírmalo en el comercio: la ruta pasa entonces a la dirección del cliente.',
    markDelivered: 'Marcar entregada',
    markFailed: 'Marcar fallida',
    codeTitle: 'Código de entrega',
    codeHint: 'Pídele al cliente su código de 4 dígitos y escríbelo para confirmar.',
    confirmDelivery: 'Confirmar entrega',
    cancel: 'Cancelar',
    failTitle: 'Motivo del fallo',
    notesPlaceholder: 'Notas (opcional)',
    confirmFail: 'Confirmar fallo',
  },
  en: {
    status: {
      PENDING: 'Pending',
      ASSIGNED: 'Pick up at the office',
      IN_TRANSIT: 'On the way to the customer',
      DELIVERED: 'Delivered',
      FAILED: 'Failed',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled',
    },
    failReasons: {
      'Cliente ausente': 'Customer not there',
      'Dirección incorrecta': 'Wrong address',
      'Cliente rechazó el pedido': 'Customer refused the order',
      'No se pudo contactar': 'Could not reach the customer',
      'Otro': 'Other',
    },
    actionFailed: 'The action could not be completed.',
    notFound: 'Delivery not found.',
    back: 'Back',
    delivery: 'Delivery',
    totalToCollect: 'TOTAL TO COLLECT',
    paySub: (products, shipping) => `Products ${products} · Delivery fee ${shipping}`,
    pickupKind: '1 · PICK UP AT',
    merchant: 'Merchant',
    mapBtn: '🗺️ Map',
    pickupTitle: 'Pick up',
    deliverKind: '2 · DELIVER TO',
    client: 'Customer',
    noAddress: 'No address',
    deliverTitle: 'Deliver',
    viewRoute: '🗺️  See route on the map',
    etaLabel: (eta) => `⏱️ Estimated time: ${eta}`,
    notePrefix: 'Note: ',
    receivedByPrefix: 'Received by: ',
    reasonPrefix: 'Reason: ',
    collected: 'I picked up the order',
    collectedHint: 'Confirm it at the merchant: the route then switches to the customer’s address.',
    markDelivered: 'Mark delivered',
    markFailed: 'Mark failed',
    codeTitle: 'Delivery code',
    codeHint: 'Ask the customer for their 4-digit code and type it in to confirm.',
    confirmDelivery: 'Confirm delivery',
    cancel: 'Cancel',
    failTitle: 'Failure reason',
    notesPlaceholder: 'Notes (optional)',
    confirmFail: 'Confirm failure',
  },
  fr: {
    status: {
      PENDING: 'En attente',
      ASSIGNED: 'À récupérer au bureau',
      IN_TRANSIT: 'En route vers le client',
      DELIVERED: 'Livrée',
      FAILED: 'Échouée',
      RETURNED: 'Retournée',
      CANCELLED: 'Annulée',
    },
    failReasons: {
      'Cliente ausente': 'Client absent',
      'Dirección incorrecta': 'Adresse incorrecte',
      'Cliente rechazó el pedido': 'Le client a refusé la commande',
      'No se pudo contactar': 'Impossible de joindre le client',
      'Otro': 'Autre',
    },
    actionFailed: 'L’action n’a pas pu être effectuée.',
    notFound: 'Livraison introuvable.',
    back: 'Retour',
    delivery: 'Livraison',
    totalToCollect: 'TOTAL À ENCAISSER',
    paySub: (products, shipping) => `Produits ${products} · Livraison ${shipping}`,
    pickupKind: '1 · RÉCUPÉRER À',
    merchant: 'Commerce',
    mapBtn: '🗺️ Carte',
    pickupTitle: 'Récupérer',
    deliverKind: '2 · LIVRER À',
    client: 'Client',
    noAddress: 'Sans adresse',
    deliverTitle: 'Livrer',
    viewRoute: '🗺️  Voir l’itinéraire sur la carte',
    etaLabel: (eta) => `⏱️ Temps estimé : ${eta}`,
    notePrefix: 'Note : ',
    receivedByPrefix: 'Reçu par : ',
    reasonPrefix: 'Motif : ',
    collected: 'J’ai récupéré la commande',
    collectedHint: 'Confirmez-le au commerce : l’itinéraire passe alors à l’adresse du client.',
    markDelivered: 'Marquer comme livrée',
    markFailed: 'Marquer comme échouée',
    codeTitle: 'Code de livraison',
    codeHint: 'Demandez au client son code à 4 chiffres et saisissez-le pour confirmer.',
    confirmDelivery: 'Confirmer la livraison',
    cancel: 'Annuler',
    failTitle: 'Motif de l’échec',
    notesPlaceholder: 'Notes (facultatif)',
    confirmFail: 'Confirmer l’échec',
  },
};

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const tx = useStrings(S);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which inline panel is open, plus its inputs.
  const [panel, setPanel] = useState<'none' | 'deliver' | 'fail'>('none');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  // The rate-the-order popup, raised the moment the delivery is confirmed: rating right then is
  // one tap, and closing it is what performs the usual trip back to the route.
  const [rateOpen, setRateOpen] = useState(false);

  // The list endpoint is already driver-scoped, so re-use it and pick this stop out of it rather
  // than adding a per-id endpoint.
  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.myDeliveries();
    if (!res.success) { setError(res.message); return; }
    setDelivery((res.data ?? []).find((d) => d.id === id) ?? null);
  }, [token, id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // Both open the in-app map screen rather than handing off to Google Maps, so the driver never
  // leaves the app mid-route. The map geocodes an address-only stop itself. `me: '1'` is what
  // makes it a route rather than a lone pin: the map tracks the driver's own position and draws
  // the street route from it to the stop.
  const openMap = (params: { lat?: number | null; lng?: number | null; address?: string | null; title: string; img?: string | null }) => {
    if (params.lat == null && !params.address) return;
    router.push({
      pathname: '/map',
      params: {
        ...(params.lat != null ? { lat: String(params.lat) } : {}),
        ...(params.lng != null ? { lng: String(params.lng) } : {}),
        ...(params.address ? { address: params.address } : {}),
        ...(params.img ? { img: params.img } : {}),
        title: params.title,
        me: '1',
      },
    });
  };
  const openMapCoords = () => openMap({
    lat: delivery?.latitude,
    lng: delivery?.longitude,
    address: delivery?.addressLine,
    title: delivery?.recipientName ?? tx.deliverTitle,
    img: delivery?.customerImageUrl,
  });
  // The pickup now opens on the merchant's own pin when its office has one, exactly like the
  // drop-off above. The address still goes along so the map can geocode it when it does not.
  const openMapPickup = () => openMap({
    lat: delivery?.pickupLatitude,
    lng: delivery?.pickupLongitude,
    address: delivery?.pickupAddress,
    title: delivery?.pickupName ?? tx.pickupTitle,
    img: delivery?.pickupImageUrl,
  });
  const call = (phone?: string | null) => { if (phone) Linking.openURL(`tel:${phone}`); };

  // Driving estimate office -> order, shown with the route button. Null (hidden) until both
  // stops have a pin and the router has answered.
  const eta = useRouteEta(
    delivery?.pickupLatitude, delivery?.pickupLongitude,
    delivery?.latitude, delivery?.longitude,
  );

  const leave = () => {
    // Back to the route, which flushes and refetches on focus. Fall back to the home when this screen
    // was opened directly (no history) so the action does not end on a "GO_BACK not handled" error.
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  // Every action goes through the outbox: online it applies immediately, offline it queues and the
  // driver still moves on. Either way we return to the route, which flushes and refetches on focus
  // -- except a completed handover, which first raises the rating popup and leaves when it closes.
  const runAction = async (build: (key: string) => OutboxItem, thenRate = false) => {
    if (!token || !delivery) return;
    setBusy(true);
    setError(null);
    const res = await outbox.submit(build(outbox.newKey()));
    setBusy(false);
    if (!res.ok) { setError(res.error ?? tx.actionFailed); return; }
    if (thenRate && delivery.orderId) {
      setPanel('none');
      setCode('');
      // Refreshed so the screen behind the popup already reads DELIVERED (and its inline rating
      // card is there when the popup closes).
      void load();
      setRateOpen(true);
      return;
    }
    leave();
  };

  if (loading) {
    return <GradientBackground><SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View></SafeAreaView></GradientBackground>;
  }
  if (!delivery) {
    return <GradientBackground><SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>{tx.notFound}</Text></View></SafeAreaView></GradientBackground>;
  }

  const s = { label: tx.status[delivery.status] ?? delivery.status, color: STATUS_COLORS[delivery.status] ?? '#64748b' };
  // Still on the way to the office, so the outstanding action is collecting the order there. The
  // 'start' transition IS the collection: it is what moves the delivery onto the client leg.
  const canCollect = delivery.status === 'ASSIGNED' || delivery.status === 'PENDING';
  const canFinish = delivery.status === 'IN_TRANSIT';
  const finished = delivery.status === 'DELIVERED' || delivery.status === 'FAILED';

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      {/* The app's own header instead of the native stack bar, so the back control is the same
          pill every other screen uses. */}
      <View style={styles.header}>
        <BackButton
          label={tx.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        />
        <Text style={styles.heading} numberOfLines={1}>{delivery.deliveryNumber ?? tx.delivery}</Text>
        <View style={{ width: BACK_BUTTON_WIDTH }} />
      </View>
      {/* Lifts the scroll over the keyboard so the message composer (and the panels' inputs)
          stay visible above it instead of underneath it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.rowBetween}>
          <Text style={styles.number}>{delivery.deliveryNumber ?? tx.delivery}</Text>
          <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
        </View>

        {/* What the driver collects at the door: the order's grand total, with the envío spelled
            out so the number is explained. Hidden on deliveries with no order amounts. */}
        {delivery.orderTotal != null ? (
          <View style={styles.payCard}>
            <Text style={styles.payLabel}>{tx.totalToCollect}</Text>
            <Text style={styles.payValue}>{money(delivery.orderTotal + (delivery.orderDeliveryFee ?? 0))}</Text>
            {delivery.orderDeliveryFee != null ? (
              <Text style={styles.paySub}>
                {tx.paySub(money(delivery.orderTotal), money(delivery.orderDeliveryFee))}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Pickup: where the driver collects the order (merchant). */}
        {delivery.pickupName || delivery.pickupAddress ? (
          <View style={[styles.stopCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={[styles.stopKind, { color: '#b45309' }]}>{tx.pickupKind}</Text>
            <Text style={styles.stopName}>{delivery.pickupName ?? tx.merchant}</Text>
            {delivery.pickupAddress ? <Text style={styles.stopAddress}>{delivery.pickupAddress}</Text> : null}
            <View style={styles.stopActions}>
              {/* A pin is enough on its own: an office that has been geocoded but never had its
                  address typed in is still somewhere the courier can be sent. */}
              {delivery.pickupAddress || delivery.pickupLatitude != null ? (
                <Pressable style={styles.smallBtn} onPress={openMapPickup}><Text style={styles.smallBtnText}>{tx.mapBtn}</Text></Pressable>
              ) : null}
              {delivery.pickupPhone ? <Pressable style={styles.smallBtn} onPress={() => call(delivery.pickupPhone)}><Text style={styles.smallBtnText}>📞 {delivery.pickupPhone}</Text></Pressable> : null}
            </View>
          </View>
        ) : null}

        {/* Delivery: where the driver drops it off (client). */}
        <View style={[styles.stopCard, { borderLeftColor: '#16a34a' }]}>
          <Text style={[styles.stopKind, { color: '#15803d' }]}>{tx.deliverKind}</Text>
          <Text style={styles.stopName}>{delivery.recipientName ?? tx.client}</Text>
          <Text style={styles.stopAddress}>{delivery.addressLine ?? tx.noAddress}{delivery.city ? `, ${delivery.city}` : ''}</Text>
          <View style={styles.stopActions}>
            {/* One handler for both cases: openMapCoords already sends the address alongside the
                pin, so a stop with no coordinates still opens -- and under the customer's name,
                which the old address-only branch got wrong by titling it with the merchant's. */}
            {delivery.latitude != null || delivery.addressLine ? (
              <Pressable style={styles.smallBtn} onPress={openMapCoords}><Text style={styles.smallBtnText}>{tx.mapBtn}</Text></Pressable>
            ) : null}
            {delivery.clientPhone ? <Pressable style={styles.smallBtn} onPress={() => call(delivery.clientPhone)}><Text style={styles.smallBtnText}>📞 {delivery.clientPhone}</Text></Pressable> : null}
          </View>
        </View>

        <Pressable style={styles.routeBtn} onPress={() => router.push(`/delivery-map/${delivery.id}`)}>
          <Text style={styles.routeBtnText}>{tx.viewRoute}</Text>
          {eta ? <Text style={styles.routeEta}>{tx.etaLabel(formatEta(eta))}</Text> : null}
        </Pressable>

        {delivery.notes ? <Text style={styles.notes}>{tx.notePrefix}{delivery.notes}</Text> : null}
        {finished && delivery.receiverName ? <Text style={styles.notes}>{tx.receivedByPrefix}{delivery.receiverName}</Text> : null}
        {finished && delivery.failureReason ? <Text style={styles.notes}>{tx.reasonPrefix}{delivery.failureReason}</Text> : null}

        {/* The order's conversation: the same thread the customer and the merchant read, with the
            driver as its third voice ("ya voy en camino", "el timbre no suena"). Only marketplace
            orders have one -- an ERP dispatch has no orderId and no thread. */}
        {delivery.orderId ? (
          <OrderMessages
            orderId={delivery.orderId}
            viewer="driver"
            closed={finished || delivery.status === 'CANCELLED' || delivery.status === 'RETURNED'}
          />
        ) : null}

        {/* Delivered: the driver rates the customer and the merchant back. */}
        {delivery.orderId && delivery.status === 'DELIVERED' ? (
          <OrderRatingCard
            orderId={delivery.orderId}
            targets={[
              { role: 'customer', name: delivery.recipientName },
              { role: 'merchant', name: delivery.pickupName },
            ]}
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        {canCollect ? (
          <View style={{ gap: 6 }}>
            <Pressable style={[styles.action, styles.primary]} disabled={busy} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'start', createdAt: new Date().toISOString() }))}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.collected}</Text>}
            </Pressable>
            <Text style={styles.panelHint}>{tx.collectedHint}</Text>
          </View>
        ) : null}

        {canFinish && panel === 'none' ? (
          <View style={{ gap: 10 }}>
            <Pressable style={[styles.action, styles.success]} onPress={() => setPanel('deliver')}><Text style={styles.actionText}>{tx.markDelivered}</Text></Pressable>
            <Pressable style={[styles.action, styles.danger]} onPress={() => setPanel('fail')}><Text style={styles.actionText}>{tx.markFailed}</Text></Pressable>
          </View>
        ) : null}

        {panel === 'deliver' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{tx.codeTitle}</Text>
            <Text style={styles.panelHint}>{tx.codeHint}</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="••••"
              placeholderTextColor={t.textFaint}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              textAlign="center"
              // Enter (web) or the keyboard's action key (native) is the "Confirmar entrega"
              // button below, under the same guards: 4 digits typed and nothing already running.
              returnKeyType="done"
              onSubmitEditing={() => {
                if (busy || code.length !== 4) return;
                runAction((key) => ({ key, deliveryId: delivery.id, type: 'deliver', code, createdAt: new Date().toISOString() }), true);
              }}
            />
            <Pressable style={[styles.action, styles.success, code.length !== 4 && styles.disabled]} disabled={busy || code.length !== 4} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'deliver', code, createdAt: new Date().toISOString() }), true)}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.confirmDelivery}</Text>}
            </Pressable>
            <Pressable onPress={() => { setPanel('none'); setCode(''); }}><Text style={styles.cancel}>{tx.cancel}</Text></Pressable>
          </View>
        ) : null}

        {panel === 'fail' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{tx.failTitle}</Text>
            {FAIL_REASONS.map((r) => (
              <Pressable key={r} style={[styles.reason, reason === r && styles.reasonActive]} onPress={() => setReason(r)}>
                <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{tx.failReasons[r] ?? r}</Text>
              </Pressable>
            ))}
            <TextInput style={styles.input} placeholder={tx.notesPlaceholder} placeholderTextColor={t.textFaint} value={notes} onChangeText={setNotes} />
            <Pressable style={[styles.action, styles.danger, !reason && styles.disabled]} disabled={busy || !reason} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'fail', reason: reason!, notes, createdAt: new Date().toISOString() }))}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.confirmFail}</Text>}
            </Pressable>
            <Pressable onPress={() => setPanel('none')}><Text style={styles.cancel}>{tx.cancel}</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Raised the moment the handover is confirmed; closing it makes the usual trip back. */}
      {delivery.orderId ? (
        <OrderRatingDialog
          visible={rateOpen}
          orderId={delivery.orderId}
          targets={[
            { role: 'customer', name: delivery.recipientName },
            { role: 'merchant', name: delivery.pickupName },
          ]}
          onClose={() => { setRateOpen(false); leave(); }}
        />
      ) : null}
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  heading: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 20, fontWeight: '800', color: t.text },
  muted: { color: t.textMuted },
  payCard: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, gap: 2 },
  payLabel: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5 },
  payValue: { fontSize: 24, fontWeight: '900', color: t.text },
  paySub: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  stopCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, borderLeftWidth: 4, padding: 14, gap: 4 },
  stopKind: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  stopName: { fontSize: 17, fontWeight: '800', color: t.text, marginTop: 2 },
  stopAddress: { fontSize: 14, color: t.textMuted },
  stopActions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  smallBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  smallBtnText: { color: t.text, fontWeight: '700', fontSize: 13 },
  routeBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', gap: 4 },
  routeBtnText: { color: t.text, fontWeight: '800', fontSize: 15 },
  routeEta: { color: t.textMuted, fontWeight: '700', fontSize: 13 },
  notes: { fontSize: 14, color: t.textMuted },
  error: { color: t.danger, fontSize: 14 },
  action: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primary: { backgroundColor: '#0b2a6b', borderWidth: 1, borderColor: t.border },
  success: { backgroundColor: '#16a34a' },
  danger: { backgroundColor: '#dc2626' },
  disabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  panel: { gap: 10, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14, marginTop: 6 },
  panelTitle: { fontSize: 15, fontWeight: '700', color: t.text },
  panelHint: { fontSize: 13, color: t.textMuted },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text },
  codeInput: { fontSize: 28, fontWeight: '800', letterSpacing: 12, color: t.text },
  reason: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  reasonActive: { borderColor: '#fca5a5', backgroundColor: 'rgba(220,38,38,0.2)' },
  reasonText: { color: t.textMuted, fontSize: 15 },
  reasonTextActive: { color: t.text, fontWeight: '700' },
  cancel: { color: t.textMuted, textAlign: 'center', paddingVertical: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
