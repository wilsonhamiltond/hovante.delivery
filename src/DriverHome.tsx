import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import * as outbox from './outbox';
import type { Delivery, Me } from './api';
import { GradientBackground, t } from './theme';
import { BottomNav } from './BottomNav';
import { NEARBY_RADIUS_KM, originOf, useNearbyAvailable } from './nearby';
import { PointsMap } from './PointsMap';
import { distanceKm, useDriverPosition } from './position';
import { useDriverPositionReporter } from './positionReport';
import { loadReached, saveReached } from './pickupProgress';

// The driver's home IS the pickup pool: one full-screen map where every available order hangs as a
// pin wearing its product photo. Tapping a pin opens a bottom sheet with the order's details --
// what it is, where it goes, what it pays -- and from there the claim screen. The work already in
// hand lives in the Mi ruta tab; the map is only for finding the NEXT job.

const money = (n: number) => `RD$${n.toFixed(2)}`;

export function DriverHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  // The delivery whose pin was tapped, driving the details sheet. Null while none is open.
  const [selected, setSelected] = useState<Delivery | null>(null);
  // Several orders sharing one pin: the chooser sheet listing them. Null while none is open.
  const [groupSel, setGroupSel] = useState<Delivery[] | null>(null);
  const nearby = useNearbyAvailable();
  // The driver's own bike on the map, refreshed as they move (null until the first fix, or for
  // good if the location permission is refused -- the pool map is still worth showing without it).
  const driver = useDriverPosition();
  // And reported upstream (throttled) so the merchant sees where their order is.
  useDriverPositionReporter(driver);

  // The driver's own deliveries, deciding which face the home wears: an active one turns the map
  // into the current order's leg; none leaves it as the pickup pool.
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  // On focus: flush any queued offline actions, reload the route, then show what's still pending.
  useFocusEffect(useCallback(() => {
    (async () => {
      await outbox.flush();
      const res = await api.myDeliveries();
      if (res.success) setDeliveries(res.data ?? []);
      setPending(await outbox.pendingCount());
    })();
  }, []));

  // The order being worked right now. IN_TRANSIT outranks a merely claimed one: it is the leg
  // being ridden.
  const current = useMemo(
    () => deliveries.find((d) => d.status === 'IN_TRANSIT')
      ?? deliveries.find((d) => d.status === 'ASSIGNED' || d.status === 'PENDING')
      ?? null,
    [deliveries],
  );

  // Deliveries whose office the driver has already reached. Loaded once, kept persisted, and
  // pruned to the active route so finished ids do not pile up in storage forever.
  const [reached, setReached] = useState<Set<string>>(new Set());
  useEffect(() => { loadReached().then(setReached); }, []);
  useEffect(() => {
    setReached((prev) => {
      const activeIds = new Set(deliveries.map((d) => d.id));
      const next = new Set([...prev].filter((id) => activeIds.has(id)));
      if (next.size === prev.size) return prev;
      void saveReached(next);
      return next;
    });
  }, [deliveries]);

  // Arrival at the office is what counts as the pickup, not the button: within 150 m of the
  // office pin the stop is marked reached, and only then may the leg flip to the client.
  useEffect(() => {
    if (!current || !driver) return;
    if (current.pickupLatitude == null || current.pickupLongitude == null) return;
    if (reached.has(current.id)) return;
    const km = distanceKm(driver, { lat: current.pickupLatitude, lng: current.pickupLongitude });
    if (km <= 0.15) {
      const next = new Set(reached);
      next.add(current.id);
      setReached(next);
      void saveReached(next);
    }
  }, [driver?.lat, driver?.lng, current, reached]);

  // The map's one destination: FIRST the office -- even if "Recogí el pedido" was pressed early --
  // and the client only once the delivery is started AND the office was actually visited. An
  // office that was never geocoded cannot be geofenced, so there the started status decides alone.
  const officePinned = current?.pickupLatitude != null && current?.pickupLongitude != null;
  const phase: 'office' | 'client' =
    current?.status === 'IN_TRANSIT' && (!officePinned || reached.has(current.id))
      ? 'client'
      : 'office';
  const currentPoint = current ? (phase === 'office'
    ? {
      lat: current.pickupLatitude, lng: current.pickupLongitude, address: current.pickupAddress,
      label: '1', title: current.pickupName ?? 'Recoger', color: '#f59e0b', id: current.id,
    }
    : {
      lat: current.latitude, lng: current.longitude, address: current.addressLine,
      label: '2', title: current.recipientName ?? 'Entregar', color: '#16a34a', id: current.id,
    }) : null;

  const fullName = profile?.name?.trim() || '';
  const greeting = fullName.split(' ')[0] || profile?.email || '';

  // The pool grouped by spot: orders at the same coordinates (several orders on one merchant
  // office) share ONE pin, so none of them hides under another. Coordinates are rounded to ~1 m
  // before grouping so float noise cannot split a spot in two. Pool entries with no pin at all
  // cannot be drawn.
  const poolGroups = useMemo(() => {
    const bySpot = new Map<string, { at: { lat: number; lng: number }; ds: Delivery[] }>();
    for (const d of nearby.pool) {
      const at = originOf(d);
      if (!at) continue;
      const key = `${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
      const g = bySpot.get(key);
      if (g) g.ds.push(d);
      else bySpot.set(key, { at, ds: [d] });
    }
    return [...bySpot.entries()].map(([key, g]) => ({ key, ...g }));
  }, [nearby.pool]);

  // One pin per spot: a single order shows its own photo; a group wears the first photo plus a
  // count badge (or, with no photo at all, a red teardrop carrying the count).
  const poolPoints = useMemo(() => poolGroups.map((g, i) => {
    const many = g.ds.length > 1;
    const photo = g.ds.find((d) => d.orderImageUrl)?.orderImageUrl ?? null;
    return {
      lat: g.at.lat, lng: g.at.lng, address: null,
      label: many ? String(g.ds.length) : String(i + 1),
      title: many
        ? `${g.ds.length} pedidos · ${g.ds[0].pickupName ?? 'Entrega'}`
        : (g.ds[0].pickupName ?? g.ds[0].deliveryNumber ?? 'Entrega'),
      color: many ? '#dc2626' : '#0b2a6b',
      imageUrl: photo,
      badge: many ? g.ds.length : null,
      id: g.key,
    };
  }), [poolGroups]);

  // A tapped pin: one order goes straight to its details sheet; a group opens the chooser first.
  const onPinPress = useCallback((key: string) => {
    const g = poolGroups.find((x) => x.key === key);
    if (!g) return;
    if (g.ds.length === 1) setSelected(g.ds[0]);
    else setGroupSel(g.ds);
  }, [poolGroups]);

  return (
    <GradientBackground>
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.headerBand}>
            <Text style={styles.hello} numberOfLines={1}>¡Hola, {greeting}! 🛵</Text>
            <Text style={styles.poolLine}>
              {current
                ? (phase === 'office'
                  ? `Entrega en curso · recoge en ${current.pickupName ?? 'el comercio'}`
                  : `Entrega en curso · lleva el pedido a ${current.recipientName ?? 'el cliente'}`)
                : nearby.count > 0
                  ? `${nearby.count} entrega(s) disponible(s)${nearby.filtered ? ` a menos de ${NEARBY_RADIUS_KM} km` : ''} · toca un pin`
                  : 'No hay entregas disponibles ahora'}
            </Text>
          </View>
        </SafeAreaView>

        {pending > 0 ? (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>{pending} acción(es) pendiente(s) de sincronizar.</Text>
          </View>
        ) : null}

        {/* The map is the screen, wearing one of two faces. With an order in hand it shows ONLY
            that order's current leg -- the street route from the bike to the office until the
            pickup, then from the bike to the client -- and tapping its pin opens the delivery.
            Otherwise it is the pickup pool, up the whole time there is ANY available order. */}
        <View style={styles.mapWrap}>
          {current && currentPoint ? (
            // Keyed by delivery + phase: pressing "Recogí el pedido" swaps the office pin for the
            // client's, and the map must rebuild for the new destination.
            <PointsMap
              key={`${current.id}:${phase}`}
              points={[currentPoint]}
              driver={driver}
              routeFromDriver
              onPointPress={() => router.push(`/delivery/${current.id}`)}
            />
          ) : nearby.pool.length > 0 ? (
            // Keyed by the pin set: the map builds its HTML once on mount and would otherwise
            // keep showing a pool that has since been claimed empty.
            <PointsMap
              key={poolPoints.map((p) => `${p.id}:${p.badge ?? 1}`).join('|')}
              points={poolPoints}
              driver={driver}
              // The tap opens a sheet, not the claim screen: the driver reads the job (or picks
              // one of several at the spot) first and only then decides to open it.
              onPointPress={onPinPress}
            />
          ) : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyBadge}><Text style={styles.emptyEmoji}>🗺️</Text></View>
              <Text style={styles.emptyTitle}>Sin entregas disponibles</Text>
              <Text style={styles.emptySubtitle}>
                El mapa se llenará con pedidos listos para tomar. Vuelve a mirar en un momento.
              </Text>
            </View>
          )}
        </View>

        <BottomNav active="home" variant="driver" />

        {/* Several orders on one pin: pick which to look at. Each row opens the details sheet. */}
        <Modal
          visible={groupSel != null}
          transparent
          animationType="slide"
          onRequestClose={() => setGroupSel(null)}
        >
          <Pressable style={styles.sheetScrim} onPress={() => setGroupSel(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              {groupSel ? (
                <>
                  <View style={styles.sheetHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetTitle} numberOfLines={1}>
                        {groupSel.length} pedidos en {groupSel[0].pickupName ?? 'este punto'}
                      </Text>
                      <Text style={styles.sheetSub}>Elige cuál quieres ver</Text>
                    </View>
                    <Pressable onPress={() => setGroupSel(null)} hitSlop={10}>
                      <Text style={styles.sheetClose}>✕</Text>
                    </Pressable>
                  </View>
                  {groupSel.map((d) => (
                    <Pressable
                      key={d.id}
                      style={styles.groupRow}
                      onPress={() => { setGroupSel(null); setSelected(d); }}
                    >
                      {d.orderImageUrl ? (
                        <Image source={{ uri: d.orderImageUrl }} style={styles.groupPhoto} />
                      ) : (
                        <View style={[styles.groupPhoto, styles.sheetPhotoEmpty]}><Text style={styles.groupPhotoEmoji}>🛍️</Text></View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupName} numberOfLines={1}>{d.deliveryNumber ?? 'Entrega'}</Text>
                        <Text style={styles.groupAddr} numberOfLines={1}>
                          📍 {d.addressLine ?? 'Sin dirección'}
                        </Text>
                      </View>
                      {d.orderTotal != null ? (
                        <Text style={styles.groupTotal}>{money(d.orderTotal + (d.orderDeliveryFee ?? 0))}</Text>
                      ) : null}
                      <Text style={styles.groupChevron}>›</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        {/* The tapped pin's order, as a bottom sheet over the map: enough to decide -- pickup,
            drop-off, the bag and the money -- with the claim screen one tap further. Closing it
            (the scrim, the X) just returns to the map. */}
        <Modal
          visible={selected != null}
          transparent
          animationType="slide"
          onRequestClose={() => setSelected(null)}
        >
          <Pressable style={styles.sheetScrim} onPress={() => setSelected(null)}>
            {/* A press inside the card must not fall through to the scrim and close it. */}
            <Pressable style={styles.sheet} onPress={() => {}}>
              {selected ? (
                <>
                  <View style={styles.sheetHead}>
                    {selected.orderImageUrl ? (
                      <Image source={{ uri: selected.orderImageUrl }} style={styles.sheetPhoto} />
                    ) : (
                      <View style={[styles.sheetPhoto, styles.sheetPhotoEmpty]}><Text style={styles.sheetPhotoEmoji}>🛍️</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetTitle} numberOfLines={1}>{selected.pickupName ?? 'Entrega'}</Text>
                      <Text style={styles.sheetSub} numberOfLines={1}>{selected.deliveryNumber ?? ''}</Text>
                    </View>
                    <Pressable onPress={() => setSelected(null)} hitSlop={10}>
                      <Text style={styles.sheetClose}>✕</Text>
                    </Pressable>
                  </View>

                  {selected.pickupAddress ? (
                    <Text style={styles.sheetLine} numberOfLines={2}>
                      <Text style={styles.sheetLineKind}>🏪 Recoger: </Text>{selected.pickupAddress}
                    </Text>
                  ) : null}
                  <Text style={styles.sheetLine} numberOfLines={2}>
                    <Text style={styles.sheetLineKind}>📍 Entregar: </Text>
                    {selected.addressLine ?? 'Sin dirección'}{selected.city ? `, ${selected.city}` : ''}
                  </Text>

                  {/* Who receives it: the client's name, and their phone as a straight call --
                      being able to ring before committing is often what decides taking a job. */}
                  <View style={styles.sheetClientRow}>
                    <Text style={[styles.sheetLine, { flex: 1 }]} numberOfLines={1}>
                      <Text style={styles.sheetLineKind}>👤 Cliente: </Text>
                      {selected.recipientName ?? 'Cliente'}
                    </Text>
                    {selected.clientPhone ? (
                      <Pressable
                        style={styles.sheetCallBtn}
                        onPress={() => Linking.openURL(`tel:${selected.clientPhone}`)}
                      >
                        <Text style={styles.sheetCallText}>📞 {selected.clientPhone}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* The bag, capped at three lines so a big order cannot push the button away. */}
                  {(selected.orderItems ?? []).slice(0, 3).map((li) => (
                    <Text key={li.id} style={styles.sheetItem} numberOfLines={1}>
                      {li.quantity}× {li.name ?? 'Producto'}
                    </Text>
                  ))}
                  {(selected.orderItems?.length ?? 0) > 3 ? (
                    <Text style={styles.sheetItem}>… y {selected.orderItems!.length - 3} producto(s) más</Text>
                  ) : null}

                  {selected.orderTotal != null ? (
                    <View style={styles.sheetPayRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sheetPayValue}>
                          {money(selected.orderTotal + (selected.orderDeliveryFee ?? 0))}
                        </Text>
                        <Text style={styles.sheetPayLabel}>
                          a cobrar{selected.orderDeliveryFee != null ? ` · incluye envío ${money(selected.orderDeliveryFee)}` : ''}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  <Pressable
                    style={styles.sheetCta}
                    onPress={() => { const id = selected.id; setSelected(null); router.push(`/available/${id}`); }}
                  >
                    <Text style={styles.sheetCtaText}>Ver y tomar entrega</Text>
                  </Pressable>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  headerSafe: { backgroundColor: 'transparent' },
  headerBand: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  hello: { fontSize: 22, fontWeight: '800', color: t.text },
  poolLine: { fontSize: 13, color: t.textMuted, marginTop: 2, fontWeight: '600' },

  pendingBanner: {
    backgroundColor: 'rgba(251,191,36,0.2)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)',
    borderRadius: 8, padding: 10, marginHorizontal: 16, marginBottom: 8,
  },
  pendingText: { color: '#fde68a', fontSize: 13, fontWeight: '600' },

  // Bleeds to the screen edges: the map is the content, not a card on it. The nav bar sits in
  // normal flow below it, so no clearance margin is needed.
  mapWrap: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyBadge: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: t.text, marginTop: 18 },
  emptySubtitle: {
    fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 20,
    marginTop: 6, maxWidth: 280,
  },

  // The pin's details sheet.
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  sheetPhoto: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#ffffff' },
  sheetPhotoEmpty: { backgroundColor: t.cardStrong, alignItems: 'center', justifyContent: 'center' },
  sheetPhotoEmoji: { fontSize: 22 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: t.text },
  sheetSub: { fontSize: 12, fontWeight: '700', color: t.textMuted, marginTop: 1 },
  sheetClose: { color: t.textMuted, fontSize: 18, fontWeight: '800', padding: 4 },
  sheetLine: { fontSize: 13, color: t.text, fontWeight: '600' },
  sheetLineKind: { color: t.textMuted, fontWeight: '700' },
  sheetClientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetCallBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  sheetCallText: { color: t.text, fontWeight: '700', fontSize: 12 },
  sheetItem: { fontSize: 13, color: t.textMuted },
  sheetPayRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 6,
    borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10,
  },
  sheetPayValue: { fontSize: 20, fontWeight: '900', color: t.text },
  sheetPayLabel: { fontSize: 12, fontWeight: '700', color: t.textMuted, marginTop: 1 },
  sheetCta: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  sheetCtaText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },

  // The several-orders-on-one-pin chooser.
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  groupPhoto: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#ffffff' },
  groupPhotoEmoji: { fontSize: 17 },
  groupName: { fontSize: 14, fontWeight: '800', color: t.text },
  groupAddr: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  groupTotal: { fontSize: 14, fontWeight: '800', color: t.text },
  groupChevron: { fontSize: 20, fontWeight: '800', color: t.textFaint },
});
