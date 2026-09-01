import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Order } from './api';
import { useAuthPrompt } from './AuthPrompt';
import { useCart } from './cart';
import { detectCurrentLocation } from './profileForm';
import { sessionLocationLabel, useSessionLocation } from './sessionLocation';
import { GradientBackground, GRADIENT, t } from './theme';
import { CartButton } from './CartButton';
import { NotificationsButton } from './NotificationsButton';
import { FontAwesome5 } from '@expo/vector-icons';
import { BottomNav } from './BottomNav';
import { emojiFor } from './categoryEmoji';
import { LogoSplash } from './LogoSplash';
import { orderStatusChip } from './orderStatus';
import { Skeleton } from './Skeleton';
import { useStrings, type Locale } from './i18n';

// The client home: the delivery location, search, and the orders the customer has in flight. The
// catalogue itself -- business categories and the product grid -- lives in the Explorar tab
// (ExploreHome), so this screen answers "where are my orders?" rather than "what can I buy?".

const money = (n: number) => `RD$${n.toFixed(2)}`;

// How long the floating cart bar stays up after the cart changes.
const CART_BAR_MS = 5000;

// Carousel card width. Named because the snap interval has to match it (plus the 12px gap), and
// the two drifting apart is what makes a snapping list land off-centre.
const TOP_CARD_WIDTH = 150;

// Below this many units left, the offer card says so. Above it the number is just noise.
const OFFER_SCARCITY_THRESHOLD = 10;

// How many cards each carousel shows.
const TOP_CAROUSEL_SIZE = 10;

// How many ranked items to pull. More than the items carousel shows, because the merchant ranking
// below it is summed from the same response: asking for ten items would rank merchants on ten
// products. There is no top-companies endpoint to ask instead.
const TOP_FETCH_LIMIT = 50;

// Delivery statuses that mean the order is finished -- excluded from the "current orders" row.
const DONE_STATUSES = ['DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'];

// The chip's label and colour come from orderStatus.ts, shared with the orders list and the
// tracking screen -- see the note there on why this is not four separate ladders any more.

const S: Record<
  Locale,
  {
    currentLocationFallback: string;
    deliverTo: string;
    addAddress: string;
    searchPlaceholder: string;
    viewOrder: string;
    helloName: (name: string) => string;
    hello: string;
    currentOrders: string;
    merchant: string;
    deliveryFee: (amount: string) => string;
    noCurrentOrders: string;
    guestBrowsing: string;
    signIn: string;
    guestToOrder: string;
    latestOffers: string;
    viewOffer: (name: string, percent: number) => string;
    oneLeft: string;
    someLeft: (n: number) => string;
    topOrdered: string;
    viewItemAt: (name: string, company: string | null | undefined) => string;
    sold: (n: number) => string;
    topMerchants: string;
    viewMerchantProducts: (name: string) => string;
    soldThisWeek: (n: number) => string;
    addressAlertTitle: string;
    locationAlertTitle: string;
    locationPermBody: string;
    locationFailBody: string;
    sheetSubtitle: string;
    close: string;
    noSavedAddresses: string;
    addNewAddress: string;
  }
> = {
  es: {
    currentLocationFallback: 'Tu ubicación actual',
    deliverTo: 'Enviar a',
    addAddress: 'Agrega tu dirección',
    searchPlaceholder: 'Buscar productos',
    viewOrder: 'Ver pedido',
    helloName: (name) => `¡Hola, ${name}! 👋`,
    hello: '¡Hola! 👋',
    currentOrders: 'Tus pedidos en curso',
    merchant: 'Comercio',
    deliveryFee: (amount) => `Envío ${amount}`,
    noCurrentOrders: 'No tienes pedidos en curso.',
    guestBrowsing: 'Estás explorando como invitado.',
    signIn: 'Inicia sesión',
    guestToOrder: ' para hacer pedidos.',
    latestOffers: 'Últimas ofertas',
    viewOffer: (name, percent) => `Ver ${name}, ${percent}% de descuento`,
    oneLeft: 'Queda 1',
    someLeft: (n) => `Quedan ${n}`,
    topOrdered: 'Lo más pedido',
    viewItemAt: (name, company) => `Ver ${name} en ${company ?? 'el comercio'}`,
    sold: (n) => `${n} vendidos`,
    topMerchants: 'Comercios más pedidos',
    viewMerchantProducts: (name) => `Ver productos de ${name}`,
    soldThisWeek: (n) => `${n} vendidos esta semana`,
    addressAlertTitle: 'Dirección',
    locationAlertTitle: 'Ubicación',
    locationPermBody: 'Activa el permiso de ubicación para usar tu ubicación actual.',
    locationFailBody: 'No se pudo obtener tu ubicación. Inténtalo de nuevo.',
    sheetSubtitle: 'Elige dónde quieres recibir tu pedido',
    close: 'Cerrar',
    noSavedAddresses: 'Todavía no tienes direcciones guardadas.',
    addNewAddress: 'Agregar nueva dirección',
  },
  en: {
    currentLocationFallback: 'Your current location',
    deliverTo: 'Deliver to',
    addAddress: 'Add your address',
    searchPlaceholder: 'Search products',
    viewOrder: 'View order',
    helloName: (name) => `Hi, ${name}! 👋`,
    hello: 'Hi! 👋',
    currentOrders: 'Your orders in progress',
    merchant: 'Merchant',
    deliveryFee: (amount) => `Delivery ${amount}`,
    noCurrentOrders: 'You have no orders in progress.',
    guestBrowsing: "You're browsing as a guest.",
    signIn: 'Sign in',
    guestToOrder: ' to place orders.',
    latestOffers: 'Latest deals',
    viewOffer: (name, percent) => `View ${name}, ${percent}% off`,
    oneLeft: '1 left',
    someLeft: (n) => `${n} left`,
    topOrdered: 'Most ordered',
    viewItemAt: (name, company) => `View ${name} at ${company ?? 'the merchant'}`,
    sold: (n) => `${n} sold`,
    topMerchants: 'Most ordered merchants',
    viewMerchantProducts: (name) => `View products from ${name}`,
    soldThisWeek: (n) => `${n} sold this week`,
    addressAlertTitle: 'Address',
    locationAlertTitle: 'Location',
    locationPermBody: 'Enable the location permission to use your current location.',
    locationFailBody: "We couldn't get your location. Please try again.",
    sheetSubtitle: 'Choose where you want to receive your order',
    close: 'Close',
    noSavedAddresses: "You don't have any saved addresses yet.",
    addNewAddress: 'Add a new address',
  },
  fr: {
    currentLocationFallback: 'Votre position actuelle',
    deliverTo: 'Livrer à',
    addAddress: 'Ajoutez votre adresse',
    searchPlaceholder: 'Rechercher des produits',
    viewOrder: 'Voir la commande',
    helloName: (name) => `Bonjour, ${name} ! 👋`,
    hello: 'Bonjour ! 👋',
    currentOrders: 'Vos commandes en cours',
    merchant: 'Commerce',
    deliveryFee: (amount) => `Livraison ${amount}`,
    noCurrentOrders: "Vous n'avez pas de commandes en cours.",
    guestBrowsing: 'Vous naviguez en tant qu\'invité.',
    signIn: 'Connectez-vous',
    guestToOrder: ' pour passer des commandes.',
    latestOffers: 'Dernières offres',
    viewOffer: (name, percent) => `Voir ${name}, ${percent}% de réduction`,
    oneLeft: 'Il en reste 1',
    someLeft: (n) => `Il en reste ${n}`,
    topOrdered: 'Les plus commandés',
    viewItemAt: (name, company) => `Voir ${name} chez ${company ?? 'le commerce'}`,
    sold: (n) => `${n} vendus`,
    topMerchants: 'Commerces les plus commandés',
    viewMerchantProducts: (name) => `Voir les produits de ${name}`,
    soldThisWeek: (n) => `${n} vendus cette semaine`,
    addressAlertTitle: 'Adresse',
    locationAlertTitle: 'Position',
    locationPermBody: 'Activez l\'autorisation de localisation pour utiliser votre position actuelle.',
    locationFailBody: 'Impossible d\'obtenir votre position. Veuillez réessayer.',
    sheetSubtitle: 'Choisissez où vous souhaitez recevoir votre commande',
    close: 'Fermer',
    noSavedAddresses: "Vous n'avez pas encore d'adresses enregistrées.",
    addNewAddress: 'Ajouter une nouvelle adresse',
  },
};

export function ClientHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const { promptLogin } = useAuthPrompt();
  const cart = useCart();
  const session = useSessionLocation();
  const tx = useStrings(S);
  // Whether the GPS lookup behind the sheet's "Ubicación actual" row is in flight.
  const [locating, setLocating] = useState(false);
  // Typed here, searched in Explorar: submitting hands the text to that tab rather than filtering
  // anything on this screen, which no longer lists products.
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  // The most-ordered items of the last 7 days, for the carousel.
  const [topItems, setTopItems] = useState<api.TopItem[]>([]);
  // Live price offers, shown above the best sellers.
  const [offers, setOffers] = useState<api.OfferItem[]>([]);
  // The delivery-address dropdown: the saved list, and a local echo of the chosen default so the
  // header updates the instant it is switched, before the parent refetches the profile.
  // The floating "Ver pedido" bar is a confirmation, not a permanent fixture: it appears when the
  // cart changes and retires itself, leaving the grid unobstructed. The cart stays one tap away in
  // the header button, which is always there.
  const [cartBarVisible, setCartBarVisible] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addresses, setAddresses] = useState<api.AddressHistory[]>([]);
  const [addrBusy, setAddrBusy] = useState<string | null>(null);
  // Carries the coordinates too, not just the text: they are what the catalogue is filtered by
  // until the profile refetch lands (see deliverLat below).
  const [chosen, setChosen] = useState<{ label: string | null; address: string | null; latitude: number | null; longitude: number | null } | null>(null);

  // Boot sequencing: the Volao splash holds only until the delivery point is resolved -- the one
  // answer everything below is filtered by. The rails then render immediately as SKELETONS and fill
  // in as each first load answers, so the home appears fast without assembling itself out of blank
  // sections. Each flag flips once and stays flipped: later refetches (regained focus, a switched
  // address) update in place without bringing the placeholders back.
  //
  // locationReady starts true whenever the delivery point is already answered (a signed-in profile
  // carries the saved address; a session pin survives tab switches) -- only a fresh guest has to
  // wait for the detection effect below. ordersLoaded starts true for guests, whose orders rail
  // never loads at all.
  const [locationReady, setLocationReady] = useState(profile != null || session.location != null);
  const [ordersLoaded, setOrdersLoaded] = useState(profile == null);
  const [topLoaded, setTopLoaded] = useState(false);

  // The customer's in-progress orders -- now the body of this screen. Refetched whenever the home
  // regains focus (after placing an order or coming back from tracking), so their state stays live.
  const loadOrders = useCallback(() => {
    // A guest has no orders to load -- the endpoint is account-based and would only answer 401.
    if (!profile) return;
    api.myOrders().then((res) => {
      if (res.success) {
        setOrders((res.data ?? []).filter(
          (o) => o.status !== 'CANCELLED' && !DONE_STATUSES.includes(o.deliveryStatus ?? ''),
        ));
      }
      // Settled either way: a failed load must release the splash, not hold it hostage.
    }).finally(() => setOrdersLoaded(true));
    // `!profile` above makes this depend on whether someone is signed in, not just on mount.
  }, [profile == null]);
  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  // Where this customer would have an order delivered right now -- the same precedence as the
  // catalog (ExploreHome): the session pin ("mi ubicación actual"), then an address just picked
  // from the dropdown, then the account's saved coordinates. Both carousels filter by it, so the
  // home never advertises a merchant whose quadrant excludes the customer.
  const deliverLat = session.location ? session.location.latitude
    : chosen ? chosen.latitude
    : profile?.latitude ?? null;
  const deliverLng = session.location ? session.location.longitude
    : chosen ? chosen.longitude
    : profile?.longitude ?? null;

  // Refetched when the delivery point moves (not on every focus): the week's ranking does not
  // change while someone taps between tabs, but switching address changes which merchants apply.
  // Held until the delivery point is settled, so the boot fetches once with the real point instead
  // of unfiltered-then-again -- and the splash releases on an answer that is already right.
  useEffect(() => {
    if (!locationReady) return;
    api.topWeekly(TOP_FETCH_LIMIT, deliverLat, deliverLng).then((res) => {
      if (res.success) setTopItems(res.data ?? []);
    }).finally(() => setTopLoaded(true));
  }, [deliverLat, deliverLng, locationReady]);

  // Refetched on focus, unlike the week's ranking: an offer can start or expire at any minute, and
  // a card promising a price that has just lapsed is worse than one arriving a moment late.
  useFocusEffect(useCallback(() => {
    if (!locationReady) return;
    api.latestOffers(TOP_CAROUSEL_SIZE, deliverLat, deliverLng).then((res) => {
      if (res.success) setOffers(res.data ?? []);
    });
  }, [deliverLat, deliverLng, locationReady]));

  // The merchants behind those sales, best first. Summed here rather than fetched: the API ranks
  // items, not companies, so this is the same week's numbers grouped a second way.
  const topCompanies = useMemo(() => {
    const byCompany = new Map<string, { id: string | null; name: string; logoUrl: string | null; sold: number }>();
    for (const item of topItems) {
      const name = item.companyName ?? tx.merchant;
      // Fall back to the name as the key: an item with no companyId still belongs to a merchant,
      // and dropping it would understate that merchant's total.
      const key = item.companyId ?? name;
      const row = byCompany.get(key) ?? { id: item.companyId, name, logoUrl: null, sold: 0 };
      row.sold += item.orderedCount ?? 0;
      // Every row of one merchant carries the same logo; ?? just keeps the first non-null seen.
      row.logoUrl = row.logoUrl ?? item.companyLogoUrl ?? null;
      byCompany.set(key, row);
    }
    return [...byCompany.values()].sort((a, b) => b.sold - a.sold).slice(0, TOP_CAROUSEL_SIZE);
  }, [topItems, tx]);

  // Re-shown on every change to the cart, so adding a second item brings it back for another five
  // seconds rather than leaving the first timer to expire mid-shop.
  useEffect(() => {
    if (cart.count === 0) { setCartBarVisible(false); return; }
    setCartBarVisible(true);
    const id = setTimeout(() => setCartBarVisible(false), CART_BAR_MS);
    return () => clearTimeout(id);
  }, [cart.count]);

  // Once the parent refetches the profile (on focus, e.g. back from adding an address), that is the
  // truth again -- drop the local echo so a newer default cannot be masked by a stale pick.
  useEffect(() => { setChosen(null); }, [profile?.address, profile?.addressLabel]);

  // Entering the home answers "where to?" by reading the phone, for everyone -- signed in or not.
  // A guest has no saved address to fall back on, and a signed-in customer ordering from somewhere
  // other than home would otherwise browse a catalogue filtered to an address they are nowhere
  // near. Session-scoped, so it never rewrites the saved address book: it is "deliver here today".
  //
  // Once per session, not once per mount: session.attempted survives a remount and stays set after
  // clear(), so choosing a saved address from the dropdown is not silently undone by walking back
  // into the home. Failure and denial pass in silence -- browsing simply stays unfiltered, and the
  // address dropdown is still there to answer by hand.
  useEffect(() => {
    if (session.attempted || session.location) { setLocationReady(true); return; }
    session.markAttempted();
    let active = true;
    const detection = detectCurrentLocation().then((result) => {
      if (!active || !result.ok) return;
      session.setLocation({
        address: result.location.address ?? tx.currentLocationFallback,
        latitude: result.location.lat,
        longitude: result.location.lng,
      });
    });
    // The splash waits for the detection, but only so long: a GPS fix that will not come must not
    // hold the whole home hostage. Past the cap the screen boots unfiltered, and a fix landing
    // late still applies through session.setLocation above -- the rails refilter in place.
    const cap = new Promise<void>((resolve) => setTimeout(resolve, 6000));
    Promise.race([detection, cap]).then(() => {
      if (active) setLocationReady(true);
    });
    return () => { active = false; };
  }, []);

  // Hands the query to Explorar, which is where the catalogue lives now.
  const submitSearch = () => {
    const q = search.trim();
    if (q) router.push({ pathname: '/explore', params: { q } });
  };

  const fullName = profile?.name?.trim() || '';
  const greeting = fullName.split(' ')[0] || profile?.email || '';
  // The local echo wins while it is set (right after switching); otherwise the profile is truth.
  // Precedence: where they are now beats a saved address they picked this session, which beats the
  // account's default. The session location is the most deliberate of the three -- they pressed a
  // button for it just now -- so it wins until they choose a saved address again.
  const address = (session.location?.address ?? (chosen ? chosen.address : profile?.address))?.trim();
  const addressLabel = session.location
    ? sessionLocationLabel()
    : (chosen ? chosen.label : profile?.addressLabel)?.trim();

  const openAddresses = () => {
    setAddrOpen(true);
    // Guests keep the sheet (it also offers "mi ubicación actual") but have no saved list to load.
    if (!profile) return;
    api.myAddresses().then((res) => { if (res.success) setAddresses(res.data ?? []); });
  };

  const chooseDefault = async (item: api.AddressHistory) => {
    // An address seen only on past orders has no row to point the account's default at -- it is text
    // and coordinates snapshotted onto an order. It is still a real place to deliver to, so picking
    // it sets the session pin instead: that is exactly "deliver here today", and it is what the
    // catalogue filters by. Before this, selecting one closed the sheet and did nothing at all.
    if (!item.id) {
      session.setLocation({
        address: item.address,
        latitude: item.latitude,
        longitude: item.longitude,
      });
      setChosen(null);
      setAddrOpen(false);
      return;
    }

    // Picking a saved address is an explicit answer to "where to?", so it retires the session pin
    // -- including the one already marked default, which is the likeliest way back from "here" to
    // "home" and returns below without touching the server.
    session.clear();
    if (item.isDefault) { setAddrOpen(false); return; }
    setAddrBusy(item.id);
    const res = await api.setDefaultAddress(item.id);
    setAddrBusy(null);
    if (!res.success) { Alert.alert(tx.addressAlertTitle, res.message); return; }
    setChosen({ label: item.label, address: item.address, latitude: item.latitude, longitude: item.longitude });
    setAddrOpen(false);
  };

  const addAddress = () => {
    setAddrOpen(false);
    // The address book is account-based: a guest gets the sign-in popup instead of a form whose
    // save could only fail.
    if (!profile) { promptLogin(); return; }
    router.push('/address-new');
  };

  // "Deliver where I am now": the same detection the boot runs, but on demand -- it sets the
  // session pin, so it never rewrites the saved address book.
  const useCurrentLocation = async () => {
    setLocating(true);
    const result = await detectCurrentLocation();
    setLocating(false);
    if (!result.ok) {
      Alert.alert(tx.locationAlertTitle, result.reason === 'permission'
        ? tx.locationPermBody
        : tx.locationFailBody);
      return;
    }
    session.setLocation({
      address: result.location.address ?? tx.currentLocationFallback,
      latitude: result.location.lat,
      longitude: result.location.lng,
    });
    setChosen(null);
    setAddrOpen(false);
  };

  // The GPS row highlights when the session pin is what filters the catalogue AND it is not one of
  // the saved rows below -- a saved address chosen "for today" marks its own row instead.
  const currentActive = !!session.location && !addresses.some((a) => a.address === session.location?.address);

  // The boot gate: the splash holds only while the delivery point resolves (same LogoSplash that
  // home.tsx shows while the profile loads, so the open reads as one wait). From there the rails
  // paint as skeletons and fill in -- see the loading branches in each section below.
  if (!locationReady) return <LogoSplash />;

  return (
    <GradientBackground>
    <View style={styles.root}>
      {/* Header: location + search, over the blue gradient. */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.headerBand}>
          <View style={styles.locationRow}>
            {/* A pill, so it reads as something you can tap rather than a caption. Everything sits
                on one line, and the address is the only part allowed to shrink -- a long one
                truncates instead of pushing the chevron off the edge. */}
            <Pressable style={styles.addressRow} onPress={openAddresses} accessibilityRole="button">
              <View style={styles.addressPin}><Text style={styles.pin}>📍</Text></View>
              <Text style={styles.deliverLabel}>{tx.deliverTo}</Text>
              <Text style={styles.address} numberOfLines={1}>
                {/* The name the customer gave it ("Casa"); the raw address only stands in when
                    there is no saved label to show. */}
                {addressLabel || address || tx.addAddress}
              </Text>
              {/* A real icon rather than the "⌄" glyph, which sits off the baseline and needed a
                  negative margin to look level. */}
              <View style={styles.chevronWrap}>
                <FontAwesome5 name="chevron-down" size={9} color={t.text} />
              </View>
            </Pressable>

            {/* Cart and bell: both are "what is waiting for me", pushed to the right edge so the
                address pill keeps the whole left side. */}
            <CartButton style={styles.cartBtn} />

            <NotificationsButton audience="client" style={styles.bellBtn} />
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={tx.searchPlaceholder}
              placeholderTextColor={t.textFaint}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={submitSearch}
              returnKeyType="search"
              autoCapitalize="none"
            />
          </View>

          {/* Cart bar: shows for a few seconds whenever the cart changes, then gets out of the way.
              Sits under the search field rather than over the tab bar, so it reads as part of the
              header the person is already looking at. */}
          {cart.count > 0 && cartBarVisible ? (
            <Pressable style={styles.cartBar} onPress={() => router.push('/cart')}>
              <View style={styles.cartCount}><Text style={styles.cartCountText}>{cart.count}</Text></View>
              <Text style={styles.cartBarText}>{tx.viewOrder}</Text>
              <Text style={styles.cartBarTotal}>{money(cart.total)}</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>

      {/* A plain ScrollView: what is left is a greeting and however many orders are in flight,
          which is a handful at most. The catalogue that needed virtualising now lives in Explorar. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hello}>{greeting ? tx.helloName(greeting) : tx.hello}</Text>

        {/* Current orders; tap one to track it. Skeleton chips while the first load is out, so
            the section holds its place instead of flashing "no tienes pedidos" at someone whose
            orders are still on the wire. */}
        {profile && !ordersLoaded ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.currentOrders}</Text>
            <View style={styles.skeletonRow}>
              {[0, 1].map((i) => (
                <View key={i} style={styles.orderChip}>
                  <Skeleton style={styles.skeletonLineShort} />
                  <Skeleton style={styles.skeletonLine} />
                  <Skeleton style={styles.skeletonBadge} />
                </View>
              ))}
            </View>
          </View>
        ) : orders.length > 0 ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.currentOrders}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ordersRow}>
              {orders.map((o) => (
                <Pressable key={o.id} style={styles.orderChip} onPress={() => router.push(`/order/${o.id}`)}>
                  <View style={styles.orderChipTop}>
                    <Text style={styles.orderChipNumber}>{o.orderNumber}</Text>
                    <Text style={styles.orderChipArrow}>›</Text>
                  </View>
                  <Text style={styles.orderChipMerchant} numberOfLines={1}>{o.merchantName ?? tx.merchant}</Text>
                  {/* The same badge the orders list and the tracking screen wear, so one order
                      never reads as two different states in two places. */}
                  {(() => {
                    const s = orderStatusChip(o);
                    return (
                      <View style={[styles.orderChipBadge, { backgroundColor: s.color }]}>
                        <Text style={styles.orderChipBadgeText} numberOfLines={1}>{s.label}</Text>
                      </View>
                    );
                  })()}
                  {/* Grand total (products + envío), with the fee named so the number is explained.
                      Orders without a stored fee keep showing the products total alone. */}
                  {o.deliveryFee != null ? (
                    <Text style={styles.orderChipFee}>{tx.deliveryFee(money(o.deliveryFee))}</Text>
                  ) : null}
                  <Text style={styles.orderChipTotal}>{money(o.total + (o.deliveryFee ?? 0))}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : profile ? (
          // Without the grid this screen would otherwise be a greeting on an empty page.
          <Text style={styles.empty}>{tx.noCurrentOrders}</Text>
        ) : (
          // A guest: say how to become able to order, instead of "no orders" about an account
          // that does not exist. The tap asks with the popup, so cancelling stays right here.
          <Pressable onPress={promptLogin} accessibilityRole="button">
            <Text style={styles.empty}>
              {tx.guestBrowsing}{' '}
              <Text style={styles.emptyLink}>{tx.signIn}</Text>{tx.guestToOrder}
            </Text>
          </Pressable>
        )}

        {/* Últimas ofertas: the offers running right now, newest first. Sits above the best
            sellers because it is the only rail whose contents expire -- a promotion nobody sees
            in time is a promotion that did not happen. The API sends both prices and the badge
            percentage, so nothing here recomputes a discount. */}
        {offers.length > 0 ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.latestOffers}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ordersRow}
              snapToInterval={TOP_CARD_WIDTH + 12}
              decelerationRate="fast"
            >
              {offers.map((offer) => (
                <Pressable
                  key={offer.id}
                  style={styles.topCard}
                  onPress={() => router.push({ pathname: '/explore', params: { q: offer.name } })}
                  accessibilityRole="button"
                  accessibilityLabel={tx.viewOffer(offer.name, offer.discountPercent)}
                >
                  <View style={styles.topThumb}>
                    {/* The item's own photo once the merchant has set one; the category icon
                        stands in for the ones that have none. */}
                    {offer.imageUrl ? (
                      <Image source={{ uri: offer.imageUrl }} style={styles.topThumbImage} resizeMode="contain" />
                    ) : (
                      <Text style={styles.topThumbEmoji}>{emojiFor(offer.itemTypeName ?? offer.companyName ?? undefined)}</Text>
                    )}
                    {/* Only when the rounding leaves something worth shouting about: a 0% badge
                        on a fixed-price offer that barely undercuts the item reads as a bug. */}
                    {offer.discountPercent > 0 ? (
                      <View style={styles.offerBadge}>
                        <Text style={styles.offerBadgeText}>-{offer.discountPercent}%</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.topName} numberOfLines={2}>{offer.name}</Text>
                  <Text style={styles.topCompany} numberOfLines={1}>{offer.companyName ?? tx.merchant}</Text>
                  <View style={styles.offerPrices}>
                    <Text style={styles.topPrice}>{money(offer.offerPrice)}</Text>
                    {offer.offerPrice < offer.price ? (
                      <Text style={styles.offerWas}>{money(offer.price)}</Text>
                    ) : null}
                  </View>
                  {/* Only when the count is low enough to matter: "quedan 47" is noise, and an
                      unlimited offer sends null rather than a number. A sold-out line never
                      reaches the app -- the server drops it from the list. */}
                  {offer.remainingQuantity != null && offer.remainingQuantity <= OFFER_SCARCITY_THRESHOLD ? (
                    <Text style={styles.offerLeft}>
                      {offer.remainingQuantity === 1
                        ? tx.oneLeft
                        : tx.someLeft(offer.remainingQuantity)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Lo más pedido: a horizontal carousel of the week's best sellers. Tapping a card jumps
            into Explorar narrowed to that merchant with the product's add dialog already open --
            nothing goes in the cart until the person confirms there, the same ask-first flow as
            tapping a tile (and Explorar owns the "¿cambiar de comercio?" question). Hidden
            entirely when the week has no sales rather than showing an empty rail. Skeleton cards
            while the first load is out, so the rail holds its place instead of appearing late. */}
        {!topLoaded ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.topOrdered}</Text>
            <View style={styles.skeletonRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.topCard}>
                  <Skeleton style={styles.skeletonThumb} />
                  <Skeleton style={styles.skeletonLine} />
                  <Skeleton style={styles.skeletonLineShort} />
                </View>
              ))}
            </View>
          </View>
        ) : topItems.length > 0 ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.topOrdered}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ordersRow}
              // Each card snaps into place instead of drifting to a half-shown one.
              snapToInterval={TOP_CARD_WIDTH + 12}
              decelerationRate="fast"
            >
              {topItems.slice(0, TOP_CAROUSEL_SIZE).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.topCard}
                  onPress={() => {
                    // The card's item restated as a catalogue Product, so Explorar can open its
                    // add dialog without hunting for it in the grid pages.
                    const previewItem = JSON.stringify({
                      id: item.id,
                      name: item.name,
                      description: item.description ?? null,
                      price: item.price,
                      imagePath: item.imagePath ?? null,
                      imageUrl: item.imageUrl ?? null,
                      companyId: item.companyId ?? '',
                      companyName: item.companyName ?? tx.merchant,
                      categories: [],
                    });
                    router.push({
                      pathname: '/explore',
                      params: item.companyId && item.companyName
                        ? { companyId: item.companyId, companyName: item.companyName, previewItem }
                        : { q: item.name, previewItem },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={tx.viewItemAt(item.name, item.companyName)}
                >
                  {/* The item's own photo once the merchant has set one, exactly as the catalogue
                      tiles do; the category's icon does the work for the ones that have none. */}
                  <View style={styles.topThumb}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.topThumbImage} resizeMode="contain" />
                    ) : (
                      <Text style={styles.topThumbEmoji}>{emojiFor(item.itemType?.name ?? item.companyName ?? undefined)}</Text>
                    )}
                  </View>
                  <Text style={styles.topName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.topCompany} numberOfLines={1}>{item.companyName ?? tx.merchant}</Text>
                  <View style={styles.topFooter}>
                    <Text style={styles.topPrice}>{money(item.price)}</Text>
                    {item.orderedCount ? (
                      <Text style={styles.topCount}>{tx.sold(item.orderedCount)}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Los comercios más pedidos: the same week's sales grouped by merchant. Tapping one opens
            Explorar showing only that merchant's catalogue, which is the same state the grid enters
            when a product tile's merchant name is tapped. */}
        {!topLoaded ? (
          // Same fetch as "lo más pedido" (the companies are that response grouped a second way),
          // so it shares the flag -- and the same hold-its-place reasoning.
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.topMerchants}</Text>
            <View style={styles.skeletonRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.topCard}>
                  <Skeleton style={styles.skeletonAvatar} />
                  <Skeleton style={styles.skeletonLine} />
                  <Skeleton style={styles.skeletonLineShort} />
                </View>
              ))}
            </View>
          </View>
        ) : topCompanies.length > 0 ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>{tx.topMerchants}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ordersRow}
              snapToInterval={TOP_CARD_WIDTH + 12}
              decelerationRate="fast"
            >
              {topCompanies.map((company) => (
                <Pressable
                  key={company.id ?? company.name}
                  style={styles.topCard}
                  onPress={() => router.push({
                    pathname: '/explore',
                    params: { companyId: company.id ?? '', companyName: company.name },
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={tx.viewMerchantProducts(company.name)}
                >
                  <View style={styles.companyAvatar}>
                    {company.logoUrl ? (
                      // cover, not contain: a round badge with letterboxing reads as a broken
                      // image, and logos are near-square uploads anyway.
                      <Image source={{ uri: company.logoUrl }} style={styles.companyAvatarImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.topThumbEmoji}>{emojiFor(company.name)}</Text>
                    )}
                  </View>
                  <Text style={styles.topName} numberOfLines={2}>{company.name}</Text>
                  {company.sold > 0 ? (
                    <Text style={styles.topCount}>{tx.soldThisWeek(company.sold)}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {/* Delivery-address picker: pick which saved address to deliver to, or add a new one. */}
      <Modal visible={addrOpen} transparent animationType="slide" onRequestClose={() => setAddrOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAddrOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{tx.deliverTo}</Text>
                <Text style={styles.sheetSubtitle}>{tx.sheetSubtitle}</Text>
              </View>
              {/* An explicit way out: tapping the backdrop works, but is not discoverable. */}
              <Pressable
                style={styles.sheetClose}
                onPress={() => setAddrOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={tx.close}
              >
                <Text style={styles.sheetCloseIcon}>✕</Text>
              </Pressable>
            </View>

            {/* Always first: delivering to where the person is standing needs no saved list. */}
            <Pressable
              style={[styles.sheetCard, currentActive && styles.sheetCardActive, !!addrBusy && styles.sheetCardDim]}
              onPress={useCurrentLocation}
              disabled={locating || !!addrBusy}
              accessibilityRole="button"
              accessibilityState={{ selected: currentActive }}
            >
              <View style={[styles.sheetPinBadge, currentActive && styles.sheetPinBadgeActive]}>
                <FontAwesome5 name="location-arrow" size={13} solid color={t.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetLabel}>{sessionLocationLabel()}</Text>
              </View>
              {locating ? (
                <ActivityIndicator color={t.text} size="small" />
              ) : currentActive ? (
                <View style={styles.sheetCheck}><Text style={styles.sheetCheckIcon}>✓</Text></View>
              ) : (
                <View style={styles.sheetRadio} />
              )}
            </Pressable>

            {addresses.length === 0 ? (
              <Text style={styles.sheetEmpty}>{tx.noSavedAddresses}</Text>
            ) : null}

            {addresses.map((item) => {
              // A session pin outranks both, because it is what the catalogue is actually filtered
              // by right now -- without this the row you just picked from past orders stayed
              // unhighlighted and the default kept the tick.
              const active = session.location
                ? session.location.address === item.address
                : chosen
                  ? item.label === chosen.label && item.address === chosen.address
                  : item.isDefault;
              // The id guard is not redundant: addrBusy is null when nothing is in flight, and an
              // address seen only on past orders has a null id too, so a plain equality made every
              // one of those rows show a spinner that never stopped.
              const busy = !!item.id && addrBusy === item.id;
              return (
                <Pressable
                  key={item.id ?? item.address}
                  // Each address is its own card, and the chosen one is outlined rather than
                  // marked only by a tick off to the side.
                  style={[styles.sheetCard, active && styles.sheetCardActive, !!addrBusy && !busy && styles.sheetCardDim]}
                  onPress={() => chooseDefault(item)}
                  disabled={!!addrBusy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.sheetPinBadge, active && styles.sheetPinBadgeActive]}>
                    <Text style={styles.sheetPin}>📍</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {/* The name the customer gave it ("Casa") is what identifies the address to
                        them; the street line is how it gets delivered to, which is not what they
                        are choosing between here. An entry seen only on a past order was never
                        named, so there the address stands in for one. */}
                    <Text style={styles.sheetLabel} numberOfLines={2}>
                      {item.label?.trim() || item.address}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={t.text} size="small" />
                  ) : active ? (
                    <View style={styles.sheetCheck}><Text style={styles.sheetCheckIcon}>✓</Text></View>
                  ) : (
                    <View style={styles.sheetRadio} />
                  )}
                </Pressable>
              );
            })}

            <Pressable style={styles.sheetAdd} onPress={addAddress} accessibilityRole="button">
              <View style={styles.sheetAddIconWrap}><Text style={styles.sheetAddIcon}>＋</Text></View>
              <Text style={styles.sheetAddText}>{tx.addNewAddress}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNav active="home" />
    </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  // Solid, matching the bottom nav, so the header and the tab bar frame the screen as a pair;
  // the border mirrors the nav's top border.
  headerSafe: { backgroundColor: t.bar, borderBottomWidth: 1, borderBottomColor: t.border },
  headerBand: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(3,12,34,0.62)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: GRADIENT[0], borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32, gap: 10,
    borderTopWidth: 1, borderColor: t.border,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: t.cardStrong, marginBottom: 14 },

  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: t.text },
  sheetSubtitle: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  sheetClose: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: t.card,
    borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center',
  },
  sheetCloseIcon: { color: t.text, fontSize: 14, fontWeight: '800', lineHeight: 16 },
  sheetEmpty: { color: t.textMuted, fontSize: 14, paddingVertical: 8 },

  // One card per address; the chosen one is outlined and lifted a shade.
  sheetCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
  },
  sheetCardActive: { borderColor: t.accent, backgroundColor: t.cardStrong },
  // While one row is being saved, the others read as unavailable rather than merely inert.
  sheetCardDim: { opacity: 0.5 },
  sheetPinBadge: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: t.cardStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetPinBadgeActive: { backgroundColor: t.accent },
  sheetPin: { fontSize: 17 },
  sheetLabel: { fontSize: 15, fontWeight: '800', color: t.text },
  sheetCheck: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCheckIcon: { color: t.onAccent, fontSize: 13, fontWeight: '900', lineHeight: 15 },
  // The unselected counterpart, so every row has the same shape and nothing shifts on selection.
  sheetRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: t.border },

  sheetAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 2,
    borderRadius: 14, borderWidth: 1, borderColor: t.accent, borderStyle: 'dashed',
  },
  sheetAddIconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: t.cardStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetAddIcon: { fontSize: 18, fontWeight: '900', color: t.text, lineHeight: 22 },
  sheetAddText: { flex: 1, fontSize: 15, fontWeight: '800', color: t.text },
  // Sized to its contents (no flex: 1) so the pill hugs the address instead of spanning the header.
  addressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%',
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 999,
    paddingLeft: 6, paddingRight: 6, paddingVertical: 6,
  },
  addressPin: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: t.cardStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  pin: { fontSize: 13 },
  deliverLabel: { fontSize: 11, color: t.textMuted, fontWeight: '700' },
  address: { fontSize: 15, fontWeight: '800', color: t.text, flexShrink: 1 },
  // A small disc balancing the pin badge on the other end of the pill.
  // Opposite the address pill, same height as it. Filled once a session location is held, so the
  // header shows at a glance that "now" is in effect rather than a saved address.
  // Same pill as the location button, sitting just right of it. No marginLeft:'auto' here -- that
  // one already pushes the pair to the edge, and a second auto margin would split them apart.
  // Sits to the RIGHT of the cart; the cart carries the marginLeft:'auto' that pushes the pair to
  // the edge, so a second auto margin here would split them apart.
  bellBtn: { marginLeft: 8 },
  cartBtn: { marginLeft: 'auto' },
  // Overhangs the button's rim, so the count never sits on top of the icon it counts.
  chevronWrap: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: t.cardStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 9,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: t.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },

  body: { flex: 1 },
  scroll: { paddingBottom: 32 },
  hello: { fontSize: 22, fontWeight: '800', color: t.text, paddingHorizontal: 16, marginTop: 18 },


  ordersSection: { marginTop: 20 },
  ordersTitle: { fontSize: 16, fontWeight: '800', color: t.text, paddingHorizontal: 16, marginBottom: 10 },
  ordersRow: { paddingHorizontal: 16, gap: 12 },
  orderChip: {
    width: 200, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: t.accent,
  },
  orderChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderChipNumber: { fontSize: 13, fontWeight: '800', color: t.textMuted },
  orderChipArrow: { fontSize: 18, fontWeight: '800', color: t.text },
  orderChipMerchant: { fontSize: 15, fontWeight: '800', color: t.text, marginTop: 6 },
  orderChipBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6, maxWidth: '100%' },
  orderChipBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  orderChipFee: { fontSize: 11, fontWeight: '700', color: t.textFaint, marginTop: 6 },
  orderChipTotal: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 2 },

  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 12 },
  emptyLink: { color: t.text, fontWeight: '800' },

  // Narrower than an order chip: a card and a bit of the next one show at once, which is what says
  // "this scrolls" without an arrow or a row of dots.
  topCard: {
    width: TOP_CARD_WIDTH, backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    borderRadius: 14, padding: 12,
  },
  topThumb: {
    height: 64, borderRadius: 10, backgroundColor: t.cardStrong,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    // The photo fills the thumb, so the offer badge above keeps its corner.
    overflow: 'hidden',
  },
  topThumbImage: { width: '100%', height: '100%' },
  topThumbEmoji: { fontSize: 28 },
  // Corner of the thumbnail, so the discount is read with the picture rather than the price.
  offerBadge: {
    position: 'absolute', top: 6, right: 6, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: t.accent,
  },
  offerBadgeText: { fontSize: 11, fontWeight: '900', color: t.onAccent },
  offerPrices: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  // The old price, struck through and quieter, so the pair reads as "was / now" at a glance.
  offerWas: { fontSize: 12, fontWeight: '700', color: t.textFaint, textDecorationLine: 'line-through' },
  offerLeft: { fontSize: 11, fontWeight: '800', color: t.danger, marginTop: 4 },
  // Round, not the items' rounded square: a merchant reads as a badge, an item as a picture.
  companyAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: t.cardStrong,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10, alignSelf: 'center',
    // The logo fills the circle, so it has to be clipped to it.
    overflow: 'hidden',
  },
  companyAvatarImage: { width: '100%', height: '100%' },
  // Skeleton stand-ins, sized like the real cards' contents so nothing jumps when data lands. A
  // plain row (not a ScrollView): placeholders are never more than a screenful.
  skeletonRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, overflow: 'hidden' },
  skeletonThumb: { height: 64, borderRadius: 10, marginBottom: 10 },
  skeletonAvatar: { width: 56, height: 56, borderRadius: 28, alignSelf: 'center', marginBottom: 10 },
  skeletonLine: { height: 12, borderRadius: 6, marginBottom: 8 },
  skeletonLineShort: { height: 12, borderRadius: 6, marginBottom: 8, width: '60%' },
  skeletonBadge: { height: 20, borderRadius: 10, width: '50%', marginTop: 4 },
  topName: { fontSize: 14, fontWeight: '800', color: t.text },
  topCompany: { fontSize: 12, fontWeight: '700', color: t.textMuted, marginTop: 3 },
  topFooter: { marginTop: 8 },
  topPrice: { fontSize: 14, fontWeight: '800', color: t.text },
  topCount: { fontSize: 11, fontWeight: '700', color: t.textMuted, marginTop: 2 },

  cartBar: {
    // In the header's flow, directly beneath the search field. Nothing about it is positioned any
    // more, so the Android navigation bar it used to collide with is no longer a factor.
    marginTop: 10, backgroundColor: t.accent, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 6px 18px rgba(0,0,0,0.28)' as any } : { elevation: 4 }),
  },
  cartCount: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(29,78,216,0.15)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  cartCountText: { color: t.onAccent, fontWeight: '800', fontSize: 14 },
  cartBarText: { flex: 1, color: t.onAccent, fontWeight: '800', fontSize: 16 },
  cartBarTotal: { color: t.onAccent, fontWeight: '800', fontSize: 16 },

});
