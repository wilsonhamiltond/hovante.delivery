import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../../src/api';
import type { Order } from '../../src/api';
import { statusOf } from '../../src/MerchantOrderCard';
import { QueueTimeModal } from '../../src/QueueTimeModal';
import { OrderMessages } from '../../src/OrderMessages';
import { InvoiceModal } from '../../src/InvoiceModal';
import { PointsMap } from '../../src/PointsMap';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { strings, useStrings, type Locale } from '../../src/i18n';

const money = (n: number) => `RD$${n.toFixed(2)}`;

const fmtStamp = (iso?: string | null): string | null =>
  iso ? new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

const S: Record<
  Locale,
  {
    justNow: string;
    agoMin: (mins: number) => string;
    agoHours: (hours: number, mins: number) => string;
    orderFallback: string;
    notFound: string;
    pickupAtStore: string;
    promisedNow: string;
    promisedIn: (min: number) => string;
    client: string;
    clientFallback: string;
    deliverTo: string;
    merchantFallback: string;
    viewOnMap: string;
    driver: string;
    driverFallback: string;
    driverInTransit: string;
    driverAssigned: string;
    positionReported: (ago: string) => string;
    products: string;
    perUnit: (price: string) => string;
    subtotal: string;
    deliveryFee: string;
    total: string;
    payWith: string;
    change: string;
    invoice: string;
    view: string;
    cancelReason: (reason: string) => string;
    confirmOrder: string;
    reject: string;
    rejectAsk: string;
    rejectReasons: Record<string, string>;
    rejectNotesLabel: string;
    rejectNotesPlaceholder: string;
    rejectYes: string;
    noteToClient: string;
    notePlaceholder: string;
    noteSend: string;
    noteEdit: string;
    no: string;
    readyForPickup: string;
    deliverToClient: string;
    deliverHint: string;
    deliverOrder: string;
    viewInvoice: string;
    invoiceOrder: string;
  }
> = {
  es: {
    justNow: 'hace un momento',
    agoMin: (mins) => `hace ${mins} min`,
    agoHours: (hours, mins) => `hace ${hours} h ${mins} min`,
    orderFallback: 'Pedido',
    notFound: 'Pedido no encontrado.',
    pickupAtStore: '🏪 Retiro en tienda · el cliente pasa a recogerlo',
    promisedNow: 'Se prometió empezar de inmediato',
    promisedIn: (min) => `Se prometió empezar en ${min} min`,
    client: 'Cliente',
    clientFallback: 'Cliente',
    deliverTo: 'Entregar',
    merchantFallback: 'Comercio',
    viewOnMap: '🗺️ Ver en el mapa',
    driver: 'Repartidor',
    driverFallback: 'Repartidor',
    driverInTransit: 'Va en camino con el pedido.',
    driverAssigned: 'Viene hacia el comercio a recoger.',
    positionReported: (ago) => `Ubicación reportada ${ago}.`,
    products: 'Productos',
    perUnit: (price) => `${price} c/u`,
    subtotal: 'Subtotal',
    deliveryFee: 'Envío',
    total: 'Total',
    payWith: 'Paga con',
    change: 'Devuelta',
    invoice: 'Factura',
    view: 'Ver ›',
    cancelReason: (reason) => `Motivo de cancelación: ${reason}`,
    confirmOrder: 'Confirmar pedido',
    reject: 'Rechazar',
    rejectAsk: '¿Por qué rechazas este pedido? El cliente verá el motivo.',
    rejectReasons: {},
    rejectNotesLabel: 'Notas (opcional)',
    rejectNotesPlaceholder: 'Cuéntale más al cliente…',
    rejectYes: 'Sí, rechazar',
    noteToClient: '💬 Mensaje al cliente',
    notePlaceholder: 'Escribe una nota para el cliente…',
    noteSend: 'Enviar nota',
    noteEdit: '✎ Nota',
    no: 'No',
    readyForPickup: 'Listo para recoger',
    deliverToClient: 'Entregar al cliente',
    deliverHint: 'Pídele al cliente el código de entrega de su pantalla de seguimiento.',
    deliverOrder: 'Entregar pedido',
    viewInvoice: '🧾 Ver factura',
    invoiceOrder: '🧾 Facturar pedido',
  },
  en: {
    justNow: 'a moment ago',
    agoMin: (mins) => `${mins} min ago`,
    agoHours: (hours, mins) => `${hours} h ${mins} min ago`,
    orderFallback: 'Order',
    notFound: 'Order not found.',
    pickupAtStore: '🏪 Pickup at store · the customer will come to collect it',
    promisedNow: 'Promised to start right away',
    promisedIn: (min) => `Promised to start in ${min} min`,
    client: 'Customer',
    clientFallback: 'Customer',
    deliverTo: 'Deliver',
    merchantFallback: 'Merchant',
    viewOnMap: '🗺️ View on map',
    driver: 'Driver',
    driverFallback: 'Driver',
    driverInTransit: 'On the way with the order.',
    driverAssigned: 'Heading to the store to pick up.',
    positionReported: (ago) => `Location reported ${ago}.`,
    products: 'Products',
    perUnit: (price) => `${price} each`,
    subtotal: 'Subtotal',
    deliveryFee: 'Delivery',
    total: 'Total',
    payWith: 'Pays with',
    change: 'Change',
    invoice: 'Invoice',
    view: 'View ›',
    cancelReason: (reason) => `Cancellation reason: ${reason}`,
    confirmOrder: 'Confirm order',
    reject: 'Reject',
    rejectAsk: 'Why are you rejecting this order? The customer will see the reason.',
    rejectReasons: {
      'Producto no disponible': 'Product not available',
      'Estamos muy ocupados': 'We are too busy right now',
      'Cerrado en este momento': 'Closed at the moment',
      'Otro': 'Other',
    },
    rejectNotesLabel: 'Notes (optional)',
    rejectNotesPlaceholder: 'Tell the customer more…',
    rejectYes: 'Yes, reject',
    noteToClient: '💬 Message the customer',
    notePlaceholder: 'Write a note for the customer…',
    noteSend: 'Send note',
    noteEdit: '✎ Note',
    no: 'No',
    readyForPickup: 'Ready for pickup',
    deliverToClient: 'Hand over to the customer',
    deliverHint: 'Ask the customer for the delivery code on their tracking screen.',
    deliverOrder: 'Deliver order',
    viewInvoice: '🧾 View invoice',
    invoiceOrder: '🧾 Invoice order',
  },
  fr: {
    justNow: 'il y a un instant',
    agoMin: (mins) => `il y a ${mins} min`,
    agoHours: (hours, mins) => `il y a ${hours} h ${mins} min`,
    orderFallback: 'Commande',
    notFound: 'Commande introuvable.',
    pickupAtStore: '🏪 Retrait en boutique · le client passe le récupérer',
    promisedNow: 'Promis de commencer immédiatement',
    promisedIn: (min) => `Promis de commencer dans ${min} min`,
    client: 'Client',
    clientFallback: 'Client',
    deliverTo: 'Livrer',
    merchantFallback: 'Commerce',
    viewOnMap: '🗺️ Voir sur la carte',
    driver: 'Livreur',
    driverFallback: 'Livreur',
    driverInTransit: 'En route avec la commande.',
    driverAssigned: 'Se dirige vers le commerce pour récupérer.',
    positionReported: (ago) => `Position signalée ${ago}.`,
    products: 'Produits',
    perUnit: (price) => `${price} l’unité`,
    subtotal: 'Sous-total',
    deliveryFee: 'Livraison',
    total: 'Total',
    payWith: 'Paie avec',
    change: 'Monnaie',
    invoice: 'Facture',
    view: 'Voir ›',
    cancelReason: (reason) => `Motif d’annulation : ${reason}`,
    confirmOrder: 'Confirmer la commande',
    reject: 'Refuser',
    rejectAsk: 'Pourquoi refusez-vous cette commande ? Le client verra le motif.',
    rejectReasons: {
      'Producto no disponible': 'Produit non disponible',
      'Estamos muy ocupados': 'Nous sommes trop occupés',
      'Cerrado en este momento': 'Fermé en ce moment',
      'Otro': 'Autre',
    },
    rejectNotesLabel: 'Notes (facultatif)',
    rejectNotesPlaceholder: 'Dites-en plus au client…',
    rejectYes: 'Oui, refuser',
    noteToClient: '💬 Message au client',
    notePlaceholder: 'Écrivez une note pour le client…',
    noteSend: 'Envoyer la note',
    noteEdit: '✎ Note',
    no: 'Non',
    readyForPickup: 'Prête à récupérer',
    deliverToClient: 'Remettre au client',
    deliverHint: 'Demandez au client le code de livraison affiché sur son écran de suivi.',
    deliverOrder: 'Livrer la commande',
    viewInvoice: '🧾 Voir la facture',
    invoiceOrder: '🧾 Facturer la commande',
  },
};

// Why a counter usually turns an order down. Like the customer's cancel reasons, the canonical
// values sent to the API stay Spanish whatever the UI language -- the customer reads the reason
// back on their tracking screen -- and only the button label translates (see S.rejectReasons).
const REJECT_REASONS = [
  'Producto no disponible',
  'Estamos muy ocupados',
  'Cerrado en este momento',
  'Otro',
];

// "hace 2 min" -- how fresh the driver's reported position is, so the pin is trusted exactly as
// much as it deserves.
function agoText(iso?: string | null): string | null {
  if (!iso) return null;
  const tx = strings(S);
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return tx.justNow;
  if (mins < 60) return tx.agoMin(mins);
  const hours = Math.floor(mins / 60);
  return tx.agoHours(hours, mins % 60);
}

// One order, the merchant's whole view of it: who ordered, where it goes, every line with its
// price, the money, the invoice once issued -- and the pipeline actions the status allows.
// Loaded from the same company-scoped list the home uses, so no extra endpoint is needed.
export default function MerchantOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tx = useStrings(S);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The reject flow: an inline "¿seguro?" step rather than Alert (whose buttons do not render on
  // web), asking why -- the reason travels to the customer's tracking screen and push.
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  // The note editor: closed (null), open on the whole order ({ lineId: null }), or open on one
  // product line. The text is seeded from whatever note already stands there.
  const [noteTarget, setNoteTarget] = useState<{ lineId: string | null } | null>(null);
  const [noteText, setNoteText] = useState('');
  // The confirm flow goes through the queue-time modal: it asks how long the order will wait
  // before preparation starts, and only then calls the API.
  const [confirming, setConfirming] = useState(false);
  // The customer's tracking-screen code, typed at the counter to hand a pickup order over.
  const [deliverCode, setDeliverCode] = useState('');
  // The invoice sheet, opened by tapping the invoice number on its card.
  const [showInvoice, setShowInvoice] = useState(false);
  // The branch the order is collected from, so the customer map draws the route office → cliente
  // rather than a lone pin. Same rule the client's tracking map uses: the branch the order names,
  // falling back to the first one with a pin.
  const [office, setOffice] = useState<api.MerchantOffice | null>(null);

  const load = useCallback(async () => {
    const res = await api.merchantOrders();
    if (!res.success) { setError(res.message); return; }
    setError(null);
    setOrder((res.data ?? []).find((o) => o.id === id) ?? null);
  }, [id]);

  // Refresh on focus and poll while open, so the street side (driver, delivery) advances live.
  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => alive && setLoading(false));
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [load]));

  // Fetched once per order -- a branch does not move while a screen is open.
  const merchantCompanyId = order?.merchantCompanyId;
  const officeId = order?.officeId;
  useEffect(() => {
    if (!merchantCompanyId) return;
    let alive = true;
    api.merchantOffices(merchantCompanyId).then((res) => {
      if (!alive || !res.success) return;
      const pinned = (res.data ?? []).filter((o) => o.latitude != null && o.longitude != null);
      setOffice(pinned.find((o) => o.id === officeId) ?? pinned[0] ?? null);
    });
    return () => { alive = false; };
  }, [merchantCompanyId, officeId]);

  // Sending (or clearing -- an emptied box) the note the editor holds. On success the editor
  // closes and the reload shows the note standing on the order/line.
  const sendNote = async () => {
    if (!order || !noteTarget) return;
    setBusy(true);
    setError(null);
    const res = await api.setMerchantOrderNote(order.id, noteText.trim(), noteTarget.lineId ?? undefined);
    setBusy(false);
    if (!res.success) { setError(res.message); return; }
    setNoteTarget(null);
    setNoteText('');
    await load();
  };

  const act = async (fn: (id: string) => Promise<api.ApiResponse<Order>>) => {
    if (!order) return false;
    setBusy(true);
    setError(null);
    const res = await fn(order.id);
    setBusy(false);
    setConfirmReject(false);
    if (!res.success) { setError(res.message); return false; }
    await load();
    return true;
  };

  // Only a successful confirm closes the modal: on failure it stays put with the error inside it,
  // so the chosen time is not lost.
  const confirmWithQueue = async (queueMinutes: number) => {
    const ok = await act((i) => api.confirmMerchantOrder(i, queueMinutes));
    if (ok) setConfirming(false);
  };

  // Issues the invoice with the company's defaults, then opens it -- the delivered-order fallback
  // for orders the READY auto-invoice missed. The reload in between is what fills documentNumber,
  // flipping the button to "Ver factura" for later visits.
  const invoiceNow = async () => {
    if (!order) return;
    setBusy(true);
    setError(null);
    const res = await api.autoInvoiceMerchantOrder(order.id);
    setBusy(false);
    if (!res.success) { setError(res.message); return; }
    await load();
    setShowInvoice(true);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (loading) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View></SafeAreaView>
      </GradientBackground>
    );
  }
  if (!order) {
    return (
      <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title={tx.orderFallback} onBack={back} />
        <View style={styles.center}><Text style={styles.muted}>{error ?? tx.notFound}</Text></View>
      </SafeAreaView>
      </GradientBackground>
    );
  }

  const s = statusOf(order);
  const grandTotal = order.total + (order.deliveryFee ?? 0);
  // In the driver flow only the DELIVERY reaches DELIVERED (the order stays READY); the counter's
  // pickup handover marks both. Either one means the goods are in the customer's hands.
  const delivered = order.status === 'DELIVERED' || order.deliveryStatus === 'DELIVERED';

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title={order.orderNumber} onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.rowBetween}>
          <Text style={styles.placedAt}>{fmtStamp(order.createdAt) ?? ''}</Text>
          <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
        </View>

        {/* A pickup order, said before anything else on the screen: no rider is coming for it. */}
        {order.pickupAtStore ? (
          <Text style={styles.queue}>{tx.pickupAtStore}</Text>
        ) : null}

        {/* The promise made at confirm, spelled out under the live chip (which counts it down and
            flips to "En preparación" when it runs out). */}
        {order.queueMinutes != null && order.status === 'CONFIRMED' ? (
          <Text style={styles.queue}>
            ⏱️ {order.queueMinutes === 0
              ? tx.promisedNow
              : tx.promisedIn(order.queueMinutes)}
          </Text>
        ) : null}

        {/* The customer: who receives it and how to reach them. */}
        <View style={styles.card}>
          <Text style={styles.label}>{tx.client}</Text>
          <View style={styles.clientRow}>
            <Text style={styles.clientName} numberOfLines={1}>👤 {order.customerName ?? tx.clientFallback}</Text>
            {order.customerPhone ? (
              <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
                <Text style={styles.callText}>📞 {order.customerPhone}</Text>
              </Pressable>
            ) : null}
          </View>
          {order.address ? <Text style={styles.address}>📍 {order.address}</Text> : null}
          {order.latitude != null && order.longitude != null ? (
            <Pressable
              style={styles.mapBtn}
              onPress={() => router.push({
                pathname: '/map',
                params: {
                  lat: String(order.latitude), lng: String(order.longitude),
                  ...(order.address ? { address: order.address } : {}),
                  title: order.customerName ?? tx.deliverTo,
                  // The customer's face on their door, when they have one.
                  ...(order.customerImageUrl ? { img: order.customerImageUrl } : {}),
                  // The branch as the route's other end, so the map shows the street route between
                  // the shop and the customer rather than a lone pin.
                  ...(office ? {
                    olat: String(office.latitude),
                    olng: String(office.longitude),
                    otitle: office.name || tx.merchantFallback,
                    ...(office.address ? { oaddress: office.address } : {}),
                    ...(order.merchantImageUrl ? { oimg: order.merchantImageUrl } : {}),
                  } : {}),
                },
              })}
            >
              <Text style={styles.mapBtnText}>{tx.viewOnMap}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* The driver, once one has claimed the delivery: who is coming to the counter and how to
            ring them about the handover. Hidden while the order is still looking for one. */}
        {order.driverName || order.driverPhone ? (
          <View style={styles.card}>
            <Text style={styles.label}>{tx.driver}</Text>
            <View style={styles.clientRow}>
              <Text style={styles.clientName} numberOfLines={1}>🛵 {order.driverName ?? tx.driverFallback}</Text>
              {order.driverPhone ? (
                <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.driverPhone}`)}>
                  <Text style={styles.callText}>📞 {order.driverPhone}</Text>
                </Pressable>
              ) : null}
            </View>
            {order.deliveryStatus === 'IN_TRANSIT' ? (
              <Text style={styles.driverState}>{tx.driverInTransit}</Text>
            ) : order.deliveryStatus === 'ASSIGNED' ? (
              <Text style={styles.driverState}>{tx.driverAssigned}</Text>
            ) : null}

            {/* Where the driver actually is: their last reported fix as the bike, with the
                delivery destination pinned for reference. The screen's 15 s poll keeps the pin
                moving; the caption says how fresh the fix is so it is trusted accordingly. */}
            {order.driverLatitude != null && order.driverLongitude != null ? (
              <>
                <View style={styles.driverMap}>
                  <PointsMap
                    // Keyed by the fix so each report rebuilds the map on the new position.
                    key={`${order.driverLatitude},${order.driverLongitude}`}
                    points={order.latitude != null && order.longitude != null ? [{
                      lat: order.latitude, lng: order.longitude, address: order.address ?? null,
                      label: '2', title: order.customerName ?? tx.deliverTo, color: '#16a34a',
                    }] : []}
                    driver={{ lat: order.driverLatitude, lng: order.driverLongitude }}
                  />
                </View>
                {agoText(order.driverPositionAt) ? (
                  <Text style={styles.driverState}>{tx.positionReported(agoText(order.driverPositionAt)!)}</Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {/* Every line with its price -- what the counter packs and charges. While the order is
            still the counter's to shape (pending/confirmed), each line can carry a note to the
            customer ("solo queda la grande"), and the order a message as a whole. */}
        <View style={styles.card}>
          <Text style={styles.label}>{tx.products}</Text>
          {order.items.map((li) => {
            const canNote = order.status === 'PENDING' || order.status === 'CONFIRMED';
            const editingThis = noteTarget?.lineId === li.id;
            return (
              <View key={li.id}>
                <View style={styles.line}>
                  <Text style={styles.lineQty}>{li.quantity}×</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName} numberOfLines={2}>{li.name}</Text>
                    <Text style={styles.lineUnit}>{tx.perUnit(money(li.unitPrice))}</Text>
                  </View>
                  {canNote ? (
                    <Pressable
                      style={styles.noteBtn}
                      onPress={() => {
                        setNoteTarget(editingThis ? null : { lineId: li.id });
                        setNoteText(editingThis ? '' : (li.merchantNote ?? ''));
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.noteBtnText}>{tx.noteEdit}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.linePrice}>{money(li.lineTotal)}</Text>
                </View>
                {li.merchantNote && !editingThis ? (
                  <Text style={styles.merchantNote}>💬 {li.merchantNote}</Text>
                ) : null}
                {editingThis ? (
                  <View style={styles.noteEditor}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder={tx.notePlaceholder}
                      placeholderTextColor={t.textFaint}
                      value={noteText}
                      onChangeText={setNoteText}
                      multiline
                    />
                    <Pressable style={[styles.action, styles.ready, busy && styles.disabled]} disabled={busy} onPress={sendNote}>
                      {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.actionText, styles.readyText]}>{tx.noteSend}</Text>}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          {order.notes ? <Text style={styles.notes}>📝 {order.notes}</Text> : null}

          {/* An order-level note written before the conversation thread existed still shows;
              new whole-order messages go through the thread card below instead. */}
          {order.merchantNote ? <Text style={styles.merchantNote}>💬 {order.merchantNote}</Text> : null}

          <View style={styles.totalRow}><Text style={styles.totalLabel}>{tx.subtotal}</Text><Text style={styles.subValue}>{money(order.total)}</Text></View>
          {order.deliveryFee != null ? (
            <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.deliveryFee}</Text><Text style={styles.subValue}>{money(order.deliveryFee)}</Text></View>
          ) : null}
          <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.total}</Text><Text style={styles.totalValue}>{money(grandTotal)}</Text></View>
          {/* Cash orders that declared a bill: what the customer pays with, and the change to have
              ready before anyone knocks on their door. */}
          {order.payWithAmount != null ? (
            <>
              <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.payWith}</Text><Text style={styles.subValue}>{money(order.payWithAmount)}</Text></View>
              <View style={styles.subRow}><Text style={styles.totalLabel}>{tx.change}</Text><Text style={styles.changeValue}>{money(order.payWithAmount - grandTotal)}</Text></View>
            </>
          ) : null}
        </View>

        {/* The conversation with the customer: substitutions offered, questions answered. The
            composer closes when the order does; a closed, empty thread renders nothing. */}
        <OrderMessages orderId={order.id} viewer="merchant" closed={delivered || order.status === 'CANCELLED'} />

        {/* The invoice, issued when the order went "listo" (or "Facturar" on the web). Tapping it
            opens the invoice itself, with printing. */}
        {order.documentNumber ? (
          <Pressable style={styles.card} onPress={() => setShowInvoice(true)} accessibilityRole="button">
            <Text style={styles.label}>{tx.invoice}</Text>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoice}>{order.documentNumber}{order.ncf ? ` · NCF ${order.ncf}` : ''}</Text>
              <Text style={styles.invoiceOpen}>{tx.view}</Text>
            </View>
          </Pressable>
        ) : null}

        {order.status === 'CANCELLED' && order.cancelReason ? (
          <Text style={styles.cancelReason}>{tx.cancelReason(order.cancelReason)}</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* The pipeline, exactly what the status allows: accept or reject a new order; release a
            confirmed one to the driver pool once the bag is packed. Anything further along is the
            street's business and only reads here. */}
        {order.status === 'PENDING' && !confirmReject ? (
          <View style={styles.actions}>
            <Pressable style={[styles.action, styles.confirm, busy && styles.disabled]} disabled={busy} onPress={() => { setError(null); setConfirming(true); }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.confirmOrder}</Text>}
            </Pressable>
            <Pressable style={[styles.action, styles.reject, busy && styles.disabled]} disabled={busy} onPress={() => setConfirmReject(true)}>
              <Text style={styles.actionText}>{tx.reject}</Text>
            </Pressable>
          </View>
        ) : null}
        {order.status === 'PENDING' && confirmReject ? (
          <View style={styles.card}>
            <Text style={styles.rejectAsk}>{tx.rejectAsk}</Text>
            {/* Same radio-row pattern as the customer's cancel screen: pick why, elaborate if
                needed. The choice is required -- the reason is the point of asking. */}
            {REJECT_REASONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.reason, rejectReason === r && styles.reasonActive]}
                onPress={() => setRejectReason(r)}
                accessibilityRole="button"
              >
                <View style={[styles.radio, rejectReason === r && styles.radioActive]}>
                  {rejectReason === r ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={[styles.reasonText, rejectReason === r && styles.reasonTextActive]}>{tx.rejectReasons[r] ?? r}</Text>
              </Pressable>
            ))}
            <Text style={styles.rejectNotesLabel}>{tx.rejectNotesLabel}</Text>
            <TextInput
              style={styles.rejectNotesInput}
              placeholder={tx.rejectNotesPlaceholder}
              placeholderTextColor={t.textFaint}
              value={rejectNotes}
              onChangeText={setRejectNotes}
              multiline
            />
            <View style={styles.actions}>
              <Pressable
                style={[styles.action, styles.reject, (busy || !rejectReason) && styles.disabled]}
                disabled={busy || !rejectReason}
                onPress={() => act((i) => api.rejectMerchantOrder(i, rejectReason!, rejectNotes.trim() || undefined))}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.rejectYes}</Text>}
              </Pressable>
              <Pressable style={[styles.action, styles.neutral]} disabled={busy} onPress={() => { setConfirmReject(false); setRejectReason(null); setRejectNotes(''); }}>
                <Text style={styles.actionText}>{tx.no}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {order.status === 'CONFIRMED' || order.status === 'PREPARING' ? (
          <Pressable style={[styles.action, styles.ready, busy && styles.disabled]} disabled={busy} onPress={() => act(api.readyMerchantOrder)}>
            {/* The accent is near-white, so this button's ink is onAccent -- white on white was
                an invisible button. */}
            {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.actionText, styles.readyText]}>{tx.readyForPickup}</Text>}
          </Pressable>
        ) : null}

        {/* The handover, for a pickup order that is ready: the customer shows the code from their
            tracking screen and the counter types it here. The server refuses a wrong one, so a
            stranger cannot walk off with someone else's bag. */}
        {order.status === 'READY' && order.pickupAtStore ? (
          <View style={styles.card}>
            <Text style={styles.label}>{tx.deliverToClient}</Text>
            <Text style={styles.deliverHint}>
              {tx.deliverHint}
            </Text>
            <TextInput
              style={styles.codeInput}
              value={deliverCode}
              onChangeText={setDeliverCode}
              placeholder="• • • •"
              placeholderTextColor={t.textFaint}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Pressable
              style={[styles.action, styles.confirm, (busy || deliverCode.trim().length < 4) && styles.disabled]}
              disabled={busy || deliverCode.trim().length < 4}
              onPress={() => act((i) => api.deliverMerchantOrder(i, deliverCode.trim()))}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.deliverOrder}</Text>}
            </Pressable>
          </View>
        ) : null}

        {/* A delivered order has no pipeline left, so the one thing still worth doing -- the
            invoice -- gets a full button of its own: view it when one exists, or issue it with the
            company's defaults when the order was delivered without one (auto-invoicing failed at
            "listo", or the order predates it). */}
        {delivered ? (
          order.documentNumber ? (
            <Pressable style={[styles.action, styles.ready]} onPress={() => setShowInvoice(true)} accessibilityRole="button">
              <Text style={[styles.actionText, styles.readyText]}>{tx.viewInvoice}</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.action, styles.ready, busy && styles.disabled]} disabled={busy} onPress={invoiceNow} accessibilityRole="button">
              {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.actionText, styles.readyText]}>{tx.invoiceOrder}</Text>}
            </Pressable>
          )
        ) : null}
      </ScrollView>

      <QueueTimeModal
        visible={confirming}
        orderNumber={order.orderNumber}
        busy={busy}
        error={error}
        onConfirm={confirmWithQueue}
        onClose={() => setConfirming(false)}
      />

      <InvoiceModal
        orderId={order.id}
        visible={showInvoice}
        onClose={() => setShowInvoice(false)}
      />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: t.textMuted },
  scroll: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placedAt: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  queue: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '65%' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, gap: 8 },
  label: { fontSize: 12, fontWeight: '800', color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientName: { flex: 1, fontSize: 16, fontWeight: '800', color: t.text },
  callBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  callText: { color: t.text, fontWeight: '700', fontSize: 12 },
  address: { fontSize: 14, color: t.textMuted },
  driverState: { fontSize: 13, color: t.textMuted, fontWeight: '600' },
  driverMap: { height: 200, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  mapBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  mapBtnText: { color: t.text, fontWeight: '800', fontSize: 14 },

  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineQty: { fontSize: 14, fontWeight: '800', color: t.text, minWidth: 30 },
  lineName: { fontSize: 14, fontWeight: '700', color: t.text },
  lineUnit: { fontSize: 12, color: t.textFaint, marginTop: 1 },
  linePrice: { fontSize: 14, fontWeight: '800', color: t.text },
  notes: { fontSize: 13, color: t.textMuted, fontStyle: 'italic' },
  // The merchant→customer note machinery: the pill that opens the editor on a line, the note as
  // it stands once written, and the editor itself.
  noteBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  noteBtnText: { color: t.text, fontSize: 12, fontWeight: '800' },
  merchantNote: { fontSize: 13, color: t.text, backgroundColor: t.cardStrong, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  noteEditor: { gap: 8 },
  noteInput: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, minHeight: 52, fontSize: 14, color: t.text, textAlignVertical: 'top' },
  noteToggle: { borderWidth: 1, borderColor: t.border, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  noteToggleText: { color: t.text, fontSize: 14, fontWeight: '800' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  subValue: { fontSize: 14, fontWeight: '700', color: t.text },
  totalValue: { fontSize: 18, fontWeight: '900', color: t.text },
  // The change to hand back on a cash order -- green, because it is money leaving the counter.
  changeValue: { fontSize: 15, fontWeight: '800', color: t.success },
  invoice: { fontSize: 15, fontWeight: '700', color: t.text },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  invoiceOpen: { fontSize: 14, fontWeight: '800', color: t.textMuted },
  cancelReason: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirm: { backgroundColor: '#16a34a' },
  ready: { backgroundColor: t.accent },
  reject: { backgroundColor: '#dc2626' },
  neutral: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // On the near-white accent button, white ink would vanish.
  readyText: { color: t.onAccent },
  rejectAsk: { color: t.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  // The reject reasons: the customer cancel screen's radio rows, restyled onto this card.
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  reasonActive: { borderColor: '#fca5a5', backgroundColor: 'rgba(220,38,38,0.18)' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#fca5a5' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fca5a5' },
  reasonText: { color: t.textMuted, fontSize: 15, flex: 1 },
  reasonTextActive: { color: t.text, fontWeight: '700' },
  rejectNotesLabel: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  rejectNotesInput: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, minHeight: 56, fontSize: 15, color: t.text, textAlignVertical: 'top' },
  deliverHint: { color: t.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  // Roomy digits, spaced like the code card the customer is reading from.
  codeInput: {
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 10, marginBottom: 10,
    fontSize: 22, fontWeight: '900', color: t.text, letterSpacing: 8, textAlign: 'center',
  },
  disabled: { opacity: 0.6 },
});
