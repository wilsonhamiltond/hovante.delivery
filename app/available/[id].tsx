import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import * as api from '../../src/api';
import type { Delivery } from '../../src/api';
import { formatEta, useRouteEta } from '../../src/eta';
import { useCoarsePosition, useDriverPosition } from '../../src/position';
import { BackButton } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { useStrings, type Locale } from '../../src/i18n';

// What a driver reads before committing to a job from the pickup pool: what it pays, where it
// starts, where it ends and how far away it is. Taking it is the one action here, and only from
// here -- the pool list itself no longer claims anything on a single tap.

const money = (n: number) => `RD$${n.toFixed(2)}`;

const S: Record<
  Locale,
  {
    notAvailableTitle: string;
    back: string;
    gone: string;
    seeOthers: string;
    delivery: string;
    available: string;
    orderLabel: string;
    product: string;
    noItems: string;
    products: string;
    shipping: string;
    totalToCollect: string;
    toPickupEta: (eta: string) => string;
    toClientEta: (eta: string) => string;
    pickupKind: string;
    merchant: string;
    mapBtn: string;
    pickupTitle: string;
    deliverKind: string;
    client: string;
    noAddress: string;
    deliverTitle: string;
    notePrefix: string;
    take: string;
    takeHint: string;
  }
> = {
  es: {
    notAvailableTitle: 'No disponible',
    back: 'Disponibles',
    gone: 'Esta entrega ya no está disponible.',
    seeOthers: 'Ver otras entregas',
    delivery: 'Entrega',
    available: 'Disponible',
    orderLabel: 'PEDIDO',
    product: 'Producto',
    noItems: 'Sin detalle de productos.',
    products: 'Productos',
    shipping: 'Envío',
    totalToCollect: 'TOTAL A COBRAR',
    toPickupEta: (eta) => `🛵 A la recogida: ${eta}`,
    toClientEta: (eta) => `📦 A la entrega: ${eta}`,
    pickupKind: '1 · RECOGER EN',
    merchant: 'Comercio',
    mapBtn: '🗺️ Mapa',
    pickupTitle: 'Recoger',
    deliverKind: '2 · ENTREGAR A',
    client: 'Cliente',
    noAddress: 'Sin dirección',
    deliverTitle: 'Entregar',
    notePrefix: 'Nota: ',
    take: 'Tomar entrega',
    takeHint: 'Al tomarla, la entrega pasa a tu ruta y deja de estar disponible para otros repartidores.',
  },
  en: {
    notAvailableTitle: 'Not available',
    back: 'Available',
    gone: 'This delivery is no longer available.',
    seeOthers: 'See other deliveries',
    delivery: 'Delivery',
    available: 'Available',
    orderLabel: 'ORDER',
    product: 'Product',
    noItems: 'No item details.',
    products: 'Products',
    shipping: 'Delivery fee',
    totalToCollect: 'TOTAL TO COLLECT',
    toPickupEta: (eta) => `🛵 To the pickup: ${eta}`,
    toClientEta: (eta) => `📦 To the drop-off: ${eta}`,
    pickupKind: '1 · PICK UP AT',
    merchant: 'Merchant',
    mapBtn: '🗺️ Map',
    pickupTitle: 'Pick up',
    deliverKind: '2 · DELIVER TO',
    client: 'Customer',
    noAddress: 'No address',
    deliverTitle: 'Deliver',
    notePrefix: 'Note: ',
    take: 'Take delivery',
    takeHint: 'Once you take it, the delivery moves to your route and is no longer available to other drivers.',
  },
  fr: {
    notAvailableTitle: 'Non disponible',
    back: 'Disponibles',
    gone: 'Cette livraison n’est plus disponible.',
    seeOthers: 'Voir d’autres livraisons',
    delivery: 'Livraison',
    available: 'Disponible',
    orderLabel: 'COMMANDE',
    product: 'Produit',
    noItems: 'Aucun détail des produits.',
    products: 'Produits',
    shipping: 'Frais de livraison',
    totalToCollect: 'TOTAL À ENCAISSER',
    toPickupEta: (eta) => `🛵 Jusqu’au retrait : ${eta}`,
    toClientEta: (eta) => `📦 Jusqu’à la livraison : ${eta}`,
    pickupKind: '1 · RETIRER CHEZ',
    merchant: 'Commerce',
    mapBtn: '🗺️ Carte',
    pickupTitle: 'Retirer',
    deliverKind: '2 · LIVRER À',
    client: 'Client',
    noAddress: 'Aucune adresse',
    deliverTitle: 'Livrer',
    notePrefix: 'Note : ',
    take: 'Prendre la livraison',
    takeHint: 'Une fois prise, la livraison passe dans votre itinéraire et n’est plus disponible pour les autres livreurs.',
  },
};

export default function AvailableDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const tx = useStrings(S);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const items = delivery?.orderItems ?? [];

  const driver = useDriverPosition();
  const origin = useCoarsePosition(driver, 100);
  // How far the driver would have to ride just to start the job -- the number that decides whether
  // it is worth taking at all.
  const toPickup = useRouteEta(
    origin?.lat, origin?.lng,
    delivery?.pickupLatitude, delivery?.pickupLongitude,
  );
  // And the job itself: office to client. Unlike the leg above this one does not move with the
  // driver, so it is the same number whoever is reading it.
  const toClient = useRouteEta(
    delivery?.pickupLatitude, delivery?.pickupLongitude,
    delivery?.latitude, delivery?.longitude,
  );

  // The pool endpoint is already the list of claimable stops, so pick this one out of it rather than
  // adding a per-id route -- the same shape /delivery/[id] uses against the driver's own list.
  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.availableDeliveries();
    if (res.success) setDelivery((res.data ?? []).find((d) => d.id === id) ?? null);
  }, [token, id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // `me: '1'`: the map tracks the driver's own position and draws the route from it to the stop,
  // so judging the ride is looking at it rather than reading a number.
  const openMap = (params: { lat?: number | null; lng?: number | null; address?: string | null; title: string }) => {
    if (params.lat == null && !params.address) return;
    router.push({
      pathname: '/map',
      params: {
        ...(params.lat != null ? { lat: String(params.lat) } : {}),
        ...(params.lng != null ? { lng: String(params.lng) } : {}),
        ...(params.address ? { address: params.address } : {}),
        title: params.title,
        me: '1',
      },
    });
  };

  const take = async () => {
    if (!delivery) return;
    setTaking(true);
    const res = await api.pickupDelivery(delivery.id);
    setTaking(false);
    if (!res.success) {
      // Another driver got there first. Back to the pool, which refetches on focus, rather than
      // leaving them looking at a job that is no longer theirs to take.
      Alert.alert(tx.notAvailableTitle, res.message);
      router.replace('/home');
      return;
    }
    // Home, where the map has already turned into this order's leg: the claim's whole point is the
    // ride to the office, and the map is what the driver follows. Replace rather than push --
    // going "back" to a claimed job sitting in the available pool would be a lie -- and the stop's
    // own detail stays a tap away from the map's pin and from Mi ruta.
    router.replace('/home');
  };

  // Straight to the pool, never router.back(). This screen is only ever reached from the pool, so
  // there is nowhere else for "back" to mean -- and going through history instead threw
  // "GO_BACK not handled" whenever canGoBack() said yes but the stack could not honour it (opened
  // from a link, or re-entered after a claim replaced the stack).
  const goBack = () => router.replace('/home');

  // The header is outside the branches below so it is there while the job is still loading and when
  // it turns out to be gone: both are states a driver needs to be able to leave.
  // Nothing but the way out: the body already opens with the delivery number and its status, so a
  // centred title here would only repeat them.
  const header = (
    <View style={styles.header}>
      <BackButton onPress={goBack} label={tx.back} />
    </View>
  );

  if (loading) {
    return (
      <GradientBackground><SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      </SafeAreaView></GradientBackground>
    );
  }
  if (!delivery) {
    return (
      <GradientBackground><SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <Text style={styles.muted}>{tx.gone}</Text>
          <Pressable style={[styles.action, styles.primary, { marginTop: 16, paddingHorizontal: 24 }]} onPress={() => router.replace('/home')}>
            <Text style={styles.actionText}>{tx.seeOthers}</Text>
          </Pressable>
        </View>
      </SafeAreaView></GradientBackground>
    );
  }

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      {header}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <Text style={styles.number}>{delivery.deliveryNumber ?? tx.delivery}</Text>
          <View style={styles.chip}><Text style={styles.chipText}>{tx.available}</Text></View>
        </View>

        {/* The order itself: every line, then the delivery charge, then what it all comes to at the
            door. Itemised rather than a lone total so the driver knows the size of the load before
            taking it, and can check the handover against it at the counter. */}
        {delivery.orderTotal != null ? (
          <View style={styles.payCard}>
            <Text style={styles.payLabel}>{tx.orderLabel}</Text>

            {items.length > 0 ? items.map((it) => (
              <View key={it.id} style={styles.lineRow}>
                <Text style={styles.lineQty}>{it.quantity}×</Text>
                <Text style={styles.lineName} numberOfLines={2}>{it.name ?? tx.product}</Text>
                <Text style={styles.lineAmount}>{money(it.lineTotal)}</Text>
              </View>
            )) : (
              // An order whose lines did not come back is still worth showing the money for -- the
              // subtotal below is the honest summary of it.
              <Text style={styles.lineNone}>{tx.noItems}</Text>
            )}

            <View style={styles.payRule} />

            <View style={styles.lineRow}>
              <Text style={styles.sumLabel}>{tx.products}</Text>
              <Text style={styles.sumAmount}>{money(delivery.orderTotal)}</Text>
            </View>
            {delivery.orderDeliveryFee != null ? (
              <View style={styles.lineRow}>
                <Text style={styles.sumLabel}>{tx.shipping}</Text>
                <Text style={styles.sumAmount}>{money(delivery.orderDeliveryFee)}</Text>
              </View>
            ) : null}

            <View style={styles.payRule} />

            <View style={styles.lineRow}>
              <Text style={[styles.payLabel, { flex: 1 }]}>{tx.totalToCollect}</Text>
              <Text style={styles.payValue}>{money(delivery.orderTotal + (delivery.orderDeliveryFee ?? 0))}</Text>
            </View>
          </View>
        ) : null}

        {/* The two rides, in the order they happen: getting there, then the delivery itself. Each
            hides on its own -- a stop with no pin on one end leaves the other still worth reading. */}
        {toPickup || toClient ? (
          <View style={styles.etaBlock}>
            {toPickup ? <Text style={styles.eta}>{tx.toPickupEta(formatEta(toPickup))}</Text> : null}
            {toClient ? <Text style={styles.eta}>{tx.toClientEta(formatEta(toClient))}</Text> : null}
          </View>
        ) : null}

        {delivery.pickupName || delivery.pickupAddress ? (
          <View style={[styles.stopCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={[styles.stopKind, { color: '#b45309' }]}>{tx.pickupKind}</Text>
            <Text style={styles.stopName}>{delivery.pickupName ?? tx.merchant}</Text>
            {delivery.pickupAddress ? <Text style={styles.stopAddress}>{delivery.pickupAddress}</Text> : null}
            <View style={styles.stopActions}>
              {delivery.pickupAddress || delivery.pickupLatitude != null ? (
                <Pressable style={styles.smallBtn} onPress={() => openMap({ lat: delivery.pickupLatitude, lng: delivery.pickupLongitude, address: delivery.pickupAddress, title: delivery.pickupName ?? tx.pickupTitle })}>
                  <Text style={styles.smallBtnText}>{tx.mapBtn}</Text>
                </Pressable>
              ) : null}
              {delivery.pickupPhone ? (
                <Pressable style={styles.smallBtn} onPress={() => Linking.openURL(`tel:${delivery.pickupPhone}`)}>
                  <Text style={styles.smallBtnText}>📞 {delivery.pickupPhone}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={[styles.stopCard, { borderLeftColor: '#16a34a' }]}>
          <Text style={[styles.stopKind, { color: '#15803d' }]}>{tx.deliverKind}</Text>
          <Text style={styles.stopName}>{delivery.recipientName ?? tx.client}</Text>
          <Text style={styles.stopAddress}>{delivery.addressLine ?? tx.noAddress}{delivery.city ? `, ${delivery.city}` : ''}</Text>
          <View style={styles.stopActions}>
            {delivery.latitude != null || delivery.addressLine ? (
              <Pressable style={styles.smallBtn} onPress={() => openMap({ lat: delivery.latitude, lng: delivery.longitude, address: delivery.addressLine, title: delivery.recipientName ?? tx.deliverTitle })}>
                <Text style={styles.smallBtnText}>{tx.mapBtn}</Text>
              </Pressable>
            ) : null}
          </View>
          {/* The customer's number is deliberately not here: nobody has taken this job yet, and the
              address is all that is needed to judge it. It appears on the route's own detail the
              moment the job is actually theirs. */}
        </View>

        {delivery.notes ? <Text style={styles.notes}>{tx.notePrefix}{delivery.notes}</Text> : null}

        <Pressable style={[styles.action, styles.success]} disabled={taking} onPress={take}>
          {taking ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{tx.take}</Text>}
        </Pressable>
        <Text style={styles.hint}>{tx.takeHint}</Text>
      </ScrollView>
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 20, fontWeight: '800', color: t.text },
  muted: { color: t.textMuted, textAlign: 'center' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#2563eb' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  payCard: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, gap: 6 },
  payLabel: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5 },
  payValue: { fontSize: 24, fontWeight: '900', color: t.text },
  payRule: { height: 1, backgroundColor: t.border, marginVertical: 2 },
  // The quantity keeps a fixed column so the names start on one edge however wide the counts run.
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineQty: { minWidth: 26, fontSize: 14, fontWeight: '800', color: t.textMuted },
  lineName: { flex: 1, fontSize: 14, fontWeight: '600', color: t.text },
  lineAmount: { fontSize: 14, fontWeight: '700', color: t.text },
  lineNone: { fontSize: 13, color: t.textFaint, fontStyle: 'italic' },
  sumLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: t.textMuted },
  sumAmount: { fontSize: 14, fontWeight: '700', color: t.textMuted },
  etaBlock: { gap: 4 },
  eta: { fontSize: 14, fontWeight: '800', color: t.text },
  stopCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, borderLeftWidth: 4, padding: 14, gap: 4 },
  stopKind: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  stopName: { fontSize: 17, fontWeight: '800', color: t.text, marginTop: 2 },
  stopAddress: { fontSize: 14, color: t.textMuted },
  stopActions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  smallBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  smallBtnText: { color: t.text, fontWeight: '700', fontSize: 13 },
  notes: { fontSize: 14, color: t.textMuted },
  action: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primary: { backgroundColor: '#0b2a6b', borderWidth: 1, borderColor: t.border },
  success: { backgroundColor: '#16a34a' },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: t.textFaint, textAlign: 'center' },
});
