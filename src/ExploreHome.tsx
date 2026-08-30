import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Order, Product } from './api';
import { useCart } from './cart';
import { detectCurrentLocation } from './profileForm';
import { useAuthPrompt } from './AuthPrompt';
import { sessionLocationLabel, useSessionLocation } from './sessionLocation';
import { Skeleton } from './Skeleton';
import { GradientBackground, GRADIENT, t } from './theme';
import { CartButton } from './CartButton';
import { NotificationsButton } from './NotificationsButton';
import { FontAwesome5 } from '@expo/vector-icons';
import { BottomNav } from './BottomNav';
import { AddToCartButton, ADDED_FEEDBACK_MS } from './AddToCartButton';
import { emojiFor } from './categoryEmoji';
import { orderStatusChip } from './orderStatus';
import { useStrings, type Locale } from './i18n';

// The "Explorar" tab: the full marketplace -- a header band with the delivery location and search,
// the business-category row, and every merchant's products (GET /delivery/products) as a
// two-across grid of item tiles.
// Each tile names its own merchant, so the catalog reads as one list of things to buy rather than a
// list of shops. Adding a product to the cart is blocked across merchants (one order, one merchant).

// PedidosYa's signature palette: a vivid rose-red on light-grey surfaces.
interface Category {
  key: string;   // 'all', or a business-category id
  label: string;
  emoji: string;
}

const money = (n: number) => `RD$${n.toFixed(2)}`;

// How long the floating cart bar stays up after the cart changes.
const CART_BAR_MS = 5000;

// Delivery statuses that mean the order is finished -- excluded from the "current orders" row.
const DONE_STATUSES = ['DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'];

// The chip's label and colour come from orderStatus.ts, shared with the home carousel, the orders
// list and the tracking screen.

// The grid is two across, so an odd number of products would leave the last one stretched over the
// full width. Padding the data with a null lets that slot render as an empty tile of equal size.
type GridCell = Product | null;

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
    allCategories: string;
    currentOrders: string;
    merchant: string;
    productsFallback: string;
    cartFromMerchant: (name: string | null) => string;
    oneMerchantOnly: string;
    emptyCart: string;
    allMerchants: string;
    viewItem: (name: string) => string;
    addItem: (name: string) => string;
    emptySearch: string;
    noMerchantAt: (place: string) => string;
    thisLocation: string;
    emptyCatalog: string;
    switchMerchantTitle: string;
    switchMerchantBody: (from: string | null, to: string) => string;
    cancel: string;
    emptyAndAdd: string;
    addToCartAt: (price: string) => string;
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
    allCategories: 'Todos',
    currentOrders: 'Tus pedidos en curso',
    merchant: 'Comercio',
    productsFallback: 'Productos',
    cartFromMerchant: (name) => `Tu pedido es de ${name}`,
    oneMerchantOnly: 'Solo puedes pedir de un comercio a la vez',
    emptyCart: 'Vaciar',
    allMerchants: '‹ Todos los comercios',
    viewItem: (name) => `Ver ${name}`,
    addItem: (name) => `Agregar ${name}`,
    emptySearch: 'No encontramos productos para tu búsqueda.',
    noMerchantAt: (place) => `Ningún comercio entrega en ${place} todavía. Prueba con otra dirección.`,
    thisLocation: 'esta ubicación',
    emptyCatalog: 'Aún no hay productos disponibles.',
    switchMerchantTitle: 'Cambiar de comercio',
    switchMerchantBody: (from, to) => `Tu carrito tiene productos de ${from}. ¿Vaciarlo y agregar de ${to}?`,
    cancel: 'Cancelar',
    emptyAndAdd: 'Vaciar y agregar',
    addToCartAt: (price) => `Agregar al carrito · ${price}`,
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
    allCategories: 'All',
    currentOrders: 'Your orders in progress',
    merchant: 'Merchant',
    productsFallback: 'Products',
    cartFromMerchant: (name) => `Your order is from ${name}`,
    oneMerchantOnly: 'You can only order from one merchant at a time',
    emptyCart: 'Empty',
    allMerchants: '‹ All merchants',
    viewItem: (name) => `View ${name}`,
    addItem: (name) => `Add ${name}`,
    emptySearch: "We couldn't find any products for your search.",
    noMerchantAt: (place) => `No merchant delivers to ${place} yet. Try a different address.`,
    thisLocation: 'this location',
    emptyCatalog: 'No products available yet.',
    switchMerchantTitle: 'Switch merchant',
    switchMerchantBody: (from, to) => `Your cart has products from ${from}. Empty it and add from ${to}?`,
    cancel: 'Cancel',
    emptyAndAdd: 'Empty and add',
    addToCartAt: (price) => `Add to cart · ${price}`,
    addressAlertTitle: 'Address',
    locationAlertTitle: 'Location',
    locationPermBody: 'Enable the location permission to use your current location.',
    locationFailBody: "We couldn't get your location. Please try again.",
    sheetSubtitle: 'Choose where you want to receive your order',
    close: 'Close',
    noSavedAddresses: "You don't have any saved addresses yet.",
    addNewAddress: 'Add a new address',
  },
};

// `initialSearch` is what the home screen's search box was carrying when it sent the person here:
// that box no longer lists anything itself, so submitting it opens this tab already filtered.
// `initialCompany` does the same for a merchant tapped in the home carousel -- it opens the grid
// already narrowed to that shop, exactly as tapping a tile's merchant name does.
// `initialPreview` is a product carried over from the home's "lo más pedido" card: the grid opens
// on its merchant with that product's preview dialog already up, so the person confirms the add
// here -- the same ask-first flow as tapping a tile, nothing lands in the cart on its own.
export function ExploreHome({ profile, initialSearch, initialCompany, initialPreview }: {
  profile: Me | null;
  initialSearch?: string;
  initialCompany?: { id: string; name: string } | null;
  initialPreview?: Product | null;
}) {
  const router = useRouter();
  const { promptLogin } = useAuthPrompt();
  const cart = useCart();
  const session = useSessionLocation();
  const tx = useStrings(S);
  // Whether the GPS lookup behind the sheet's "Ubicación actual" row is in flight.
  const [locating, setLocating] = useState(false);
  const [search, setSearch] = useState(initialSearch ?? '');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<api.BusinessCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Paging state: the debounced search actually sent, whether another page exists, and whether one
  // is in flight. requestId retires the results of a filter the person has already moved on from.
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch ?? '');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(initialCompany ?? null);
  const [orders, setOrders] = useState<Order[]>([]);
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

  // The customer's in-progress orders, for the row under the categories. Refetched whenever the home
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
    });
    // `!profile` above makes this depend on whether someone is signed in, not just on mount.
  }, [profile == null]);
  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  // The category row is driven by the business categories the marketplace exposes. The loaded flag
  // swaps the row's skeleton circles for the real chips; settled on failure too, so a dead request
  // leaves the row with just "Todos" rather than placeholders that never resolve.
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  useEffect(() => {
    api.businessCategories().then((res) => {
      if (res.success) setCategories((res.data ?? []).filter((c) => c.active));
    }).finally(() => setCategoriesLoaded(true));
  }, []);

  // --- Catalog paging ---------------------------------------------------------------------------
  // The grid holds only the pages it has scrolled to, so merchant, category and search are all
  // server-side: filtering here would only ever search the products already fetched. Changing any
  // of them restarts from the first page.

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const businessCategoryId = category === 'all' ? undefined : category;

  // One order, one merchant. So from the moment the first product goes in the cart, the catalog is
  // that merchant's: showing the rest would only lead to the "cambiar de comercio" prompt. The
  // cart's merchant is the first line's company, and it outranks a merchant picked by hand.
  const lockedCompanyId = cart.merchantId ?? undefined;
  const activeCompanyId = lockedCompanyId ?? selectedCompany?.id;

  // Where this order would go, which decides which merchants can take it. Same precedence as the
  // header pill below: the session pin, then an address just picked from the dropdown, then the
  // account's saved coordinates.
  //
  // `chosen` has to be in here, not just in the pill. The profile only catches up on the next focus
  // refetch, so reading it alone left the header naming the address the customer had just picked
  // while the catalogue was still filtered by the previous one's coordinates -- and if the old point
  // sat outside every quadrant, picking the right address still showed an empty catalogue.
  const deliverLat = session.location ? session.location.latitude
    : chosen ? chosen.latitude
    : profile?.latitude ?? null;
  const deliverLng = session.location ? session.location.longitude
    : chosen ? chosen.longitude
    : profile?.longitude ?? null;

  // Re-shown on every change to the cart, so adding a second item brings it back for another five
  // seconds rather than leaving the first timer to expire mid-shop.
  useEffect(() => {
    if (cart.count === 0) { setCartBarVisible(false); return; }
    setCartBarVisible(true);
    const id = setTimeout(() => setCartBarVisible(false), CART_BAR_MS);
    return () => clearTimeout(id);
  }, [cart.count]);

  const fetchPage = useCallback(async (skip: number) => {
    const mine = ++requestId.current;
    const res = await api.products({
      companyId: activeCompanyId,
      businessCategoryId,
      search: debouncedSearch,
      latitude: deliverLat,
      longitude: deliverLng,
      skip,
      take: api.PRODUCT_PAGE_SIZE,
    });
    // A slower response for an older filter must not overwrite a newer one's results.
    if (mine !== requestId.current) return;
    const page = res.success ? (res.data ?? []) : [];
    setProducts((prev) => (skip === 0 ? page : [...prev, ...page]));
    // A short page is the end of the catalog; a full one means there may be more.
    setHasMore(page.length === api.PRODUCT_PAGE_SIZE);
    // Moving the delivery point changes who can serve it, so the catalog reloads from page 1.
  }, [activeCompanyId, businessCategoryId, debouncedSearch, deliverLat, deliverLng]);

  // First page, and again whenever the merchant, category or search changes.
  useEffect(() => {
    setLoading(true);
    fetchPage(0).finally(() => setLoading(false));
  }, [fetchPage]);

  // Next page, when the grid scrolls near the end.
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(products.length).finally(() => setLoadingMore(false));
  };

  // Once the parent refetches the profile (on focus, e.g. back from adding an address), that is the
  // truth again -- drop the local echo so a newer default cannot be masked by a stale pick.
  useEffect(() => { setChosen(null); }, [profile?.address, profile?.addressLabel]);

  // Same rule as the home: reading the phone answers "where to?" for everyone, signed in or not,
  // and only once per session -- session.attempted survives a remount and stays set after clear(),
  // so a customer who picked a saved address is not moved back to where they are standing every
  // time they open Explorar. Normally the home has already done this and there is nothing to do
  // here; this covers arriving straight into the catalogue (a search, a deep link).
  //
  // Silent on failure or denial: browsing simply stays unfiltered, and the address dropdown is
  // still there to answer by hand.
  useEffect(() => {
    if (session.attempted || session.location) return;
    session.markAttempted();
    let active = true;
    detectCurrentLocation()
      .then((result) => {
        if (!active || !result.ok) return;
        session.setLocation({
          address: result.location.address ?? tx.currentLocationFallback,
          latitude: result.location.lat,
          longitude: result.location.lng,
        });
      })
      .catch(() => { /* denial and failure are both silence here */ });
    return () => { active = false; };
  }, []);

  // Both only set state: the effect above notices and reloads from the first page.
  const selectCompany = (id: string, name: string) => setSelectedCompany({ id, name });
  const clearCompany = () => setSelectedCompany(null);

  const categoryChips: Category[] = useMemo(() => [
    { key: 'all', label: tx.allCategories, emoji: '🍽️' },
    ...categories.map((c) => ({ key: c.id, label: c.name, emoji: emojiFor(c.name) })),
  ], [categories, tx]);

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

  // No client-side filtering left: the server returns exactly the page asked for. The list is not
  // grouped by store either -- every tile names its own merchant, so the catalog reads as one list
  // of things to buy.
  const gridData: GridCell[] = useMemo(
    () => (products.length % 2 === 1 ? [...products, null] : products),
    [products],
  );

  // Which products are currently showing the "added" tick, and the timer that clears each one.
  // Keyed by product id rather than a single id: adding a second product must not snap the first
  // one's tick back to the cart icon mid-confirmation.
  const [added, setAdded] = useState<Record<string, true>>({});
  const addedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const markAdded = (id: string) => {
    setAdded((prev) => ({ ...prev, [id]: true }));
    // Tapping the same product again restarts its five seconds instead of stacking timers.
    clearTimeout(addedTimers.current[id]);
    addedTimers.current[id] = setTimeout(() => {
      setAdded((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete addedTimers.current[id];
    }, ADDED_FEEDBACK_MS);
  };

  // Leaving the screen with ticks still counting down would fire setState on an unmounted tree.
  useEffect(() => () => {
    Object.values(addedTimers.current).forEach(clearTimeout);
    addedTimers.current = {};
  }, []);

  // Tapping a tile opens the product first and asks before it goes in the cart -- the round + on
  // the tile stays the one-tap path for someone who already knows what they want.
  const [preview, setPreview] = useState<Product | null>(null);
  // The cross-merchant question, asked inside the same sheet rather than through Alert: its
  // buttons do not render on web, and the sheet is already the surface holding the decision.
  const [previewConflict, setPreviewConflict] = useState(false);

  const openPreview = (p: Product) => { setPreviewConflict(false); setPreview(p); };
  const closePreview = () => { setPreview(null); setPreviewConflict(false); };

  const confirmAdd = () => {
    if (!preview) return;
    if (cart.tryAdd(preview) === 'conflict') { setPreviewConflict(true); return; }
    markAdded(preview.id);
    closePreview();
  };

  const confirmReplace = () => {
    if (!preview) return;
    cart.replaceWith(preview);
    markAdded(preview.id);
    closePreview();
  };

  const onAdd = (p: Product) => {
    if (cart.tryAdd(p) === 'conflict') {
      Alert.alert(
        tx.switchMerchantTitle,
        tx.switchMerchantBody(cart.merchantName, p.companyName),
        [
          { text: tx.cancel, style: 'cancel' },
          {
            text: tx.emptyAndAdd,
            style: 'destructive',
            // The tick waits for the confirmation: showing it on the first tap would claim the
            // product went in while the dialog was still asking whether to empty the cart.
            onPress: () => { cart.replaceWith(p); markAdded(p.id); },
          },
        ],
      );
      return;
    }
    markAdded(p.id);
  };

  // The product a "lo más pedido" card sent along: its preview dialog opens exactly once per
  // product -- the person adds (or dismisses) from there, the same ask-first path as tapping a
  // tile, conflict question included. Keyed by id, not a boolean: tapping a second card
  // re-navigates into this same mounted tab with a new product, and that one must open too.
  const handledInitialPreview = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPreview || handledInitialPreview.current === initialPreview.id) return;
    handledInitialPreview.current = initialPreview.id;
    openPreview(initialPreview);
  }, [initialPreview?.id]);

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

      {/* A FlatList, not a ScrollView: the catalog is thousands of products, and only a ScrollView
          would mount every one of them up front. Everything above the grid rides along as the list
          header so it scrolls with the products. */}
      <FlatList
        style={styles.body}
        data={gridData}
        keyExtractor={(item, index) => item?.id ?? `blank-${index}`}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        // Half a screen from the bottom, so the next page is usually there before the scroll is.
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore
            ? <View style={styles.footerLoading}><ActivityIndicator color={t.text} /></View>
            : null
        }
        renderItem={({ item }) => {
          // The padding cell: same width, nothing drawn, so a lone last product is not stretched.
          if (!item) return <View style={styles.tile} />;
          return (
            // The whole tile opens the product; the merchant link and the + button below are
            // nested pressables, so they still take their own taps rather than the sheet.
            <Pressable
              style={styles.tile}
              onPress={() => openPreview(item)}
              accessibilityRole="button"
              accessibilityLabel={tx.viewItem(item.name)}
            >
              {/* The item's own photo once the merchant has set one; the merchant's category icon
                  stands in for the ones that have none. */}
              {item.imageUrl ? (
                // contain, not cover: a bottle or a box photographed tall would be cropped to its
                // middle by a fill, which is exactly the part that identifies nothing.
                <Image source={{ uri: item.imageUrl }} style={styles.tileThumb} resizeMode="contain" />
              ) : (
                <View style={styles.tileThumb}>
                  <Text style={styles.tileThumbEmoji}>{emojiFor(item.categories[0] ?? item.companyName)}</Text>
                </View>
              )}
              <View style={styles.tileBody}>
                <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
                <Pressable onPress={() => selectCompany(item.companyId, item.companyName)}>
                  <Text style={styles.tileCompany} numberOfLines={1}>{item.companyName}</Text>
                </Pressable>
                <View style={styles.tileFooter}>
                  <Text style={styles.tilePrice}>{money(item.price)}</Text>
                  <AddToCartButton
                    added={!!added[item.id]}
                    onPress={() => onAdd(item)}
                    label={tx.addItem(item.name)}
                  />
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading
            // Skeleton tiles shaped like the grid about to appear, so a fresh load (first open,
            // or a changed filter that emptied the list) reads as "the products are coming"
            // rather than a bare spinner over nothing.
            ? <View>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={styles.gridRow}>
                    {[0, 1].map((col) => (
                      <View key={col} style={styles.tile}>
                        <Skeleton style={styles.tileSkeletonThumb} />
                        <View style={styles.tileBody}>
                          <Skeleton style={styles.tileSkeletonLine} />
                          <Skeleton style={styles.tileSkeletonLineShort} />
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            // An empty catalogue has two very different causes, and saying "para tu búsqueda" for
            // both sent people hunting for a product that was never going to appear: with nothing
            // typed, the list is empty because no merchant covers where the order would go.
            : debouncedSearch.trim()
              ? <Text style={styles.empty}>{tx.emptySearch}</Text>
              : deliverLat != null && deliverLng != null
                ? <Text style={styles.empty}>{tx.noMerchantAt(address ? `"${address}"` : tx.thisLocation)}</Text>
                : <Text style={styles.empty}>{tx.emptyCatalog}</Text>
        }
        ListHeaderComponent={
          <>
        <Text style={styles.hello}>{greeting ? tx.helloName(greeting) : tx.hello}</Text>

        {/* Circular category tiles. Skeleton circles while the list loads, so the row holds its
            place instead of showing a lone "Todos" that the real categories then shove aside. */}
        {!categoriesLoaded ? (
          <View style={[styles.cats, styles.catsSkeletonRow]}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.catTile}>
                <Skeleton style={styles.catSkeletonCircle} />
                <Skeleton style={styles.catSkeletonLabel} />
              </View>
            ))}
          </View>
        ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          {categoryChips.map((c) => {
            const active = c.key === category;
            return (
              <Pressable key={c.key} onPress={() => setCategory(c.key)} style={styles.catTile}>
                <View style={[styles.catCircle, active && styles.catCircleActive]}>
                  <Text style={styles.catEmoji}>{c.emoji}</Text>
                </View>
                <Text style={[styles.catLabel, active && styles.catLabelActive]} numberOfLines={1}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        )}

        {/* Current orders: a line of in-progress orders under the categories; tap one to track it. */}
        {orders.length > 0 ? (
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
                  {/* The same badge the home carousel and the tracking screen wear. */}
                  {(() => {
                    const s = orderStatusChip(o);
                    return (
                      <View style={[styles.orderChipBadge, { backgroundColor: s.color }]}>
                        <Text style={styles.orderChipBadgeText} numberOfLines={1}>{s.label}</Text>
                      </View>
                    );
                  })()}
                  <Text style={styles.orderChipTotal}>{money(o.total + (o.deliveryFee ?? 0))}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>
          {cart.merchantName ?? selectedCompany?.name ?? tx.productsFallback}
        </Text>

        {/* Why the catalog is showing one merchant. Locked by the cart it explains itself and
            offers the only way out (emptying it); picked by hand it is just a step back. */}
        {cart.merchantId ? (
          <View style={styles.focusBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusTitle}>{tx.cartFromMerchant(cart.merchantName)}</Text>
              <Text style={styles.focusHint}>{tx.oneMerchantOnly}</Text>
            </View>
            <Pressable
              style={styles.focusAction}
              onPress={() => cart.clear()}
              accessibilityRole="button"
            >
              <Text style={styles.focusActionText}>{tx.emptyCart}</Text>
            </Pressable>
          </View>
        ) : selectedCompany ? (
          <Pressable style={styles.focusBanner} onPress={clearCompany}>
            <Text style={styles.focusBack}>{tx.allMerchants}</Text>
          </Pressable>
        ) : null}
          </>
        }
      />


      {/* The tapped product, with the decision it exists to ask: add this to the cart or not. */}
      <Modal visible={preview != null} transparent animationType="slide" onRequestClose={closePreview}>
        <Pressable style={styles.sheetBackdrop} onPress={closePreview}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {preview ? (
              <>
                <View style={styles.previewHead}>
                  {preview.imageUrl ? (
                    <Image source={{ uri: preview.imageUrl }} style={styles.previewImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.previewImage, styles.previewImageEmpty]}>
                      <Text style={styles.previewEmoji}>{emojiFor(preview.categories[0] ?? preview.companyName)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewName}>{preview.name}</Text>
                    <Text style={styles.previewCompany} numberOfLines={1}>{preview.companyName}</Text>
                    <Text style={styles.previewPrice}>{money(preview.price)}</Text>
                  </View>
                </View>

                {preview.description ? (
                  <Text style={styles.previewDescription}>{preview.description}</Text>
                ) : null}

                {/* One order, one merchant: adding across shops empties the cart, so it is asked
                    here rather than assumed. */}
                {previewConflict ? (
                  <>
                    <Text style={styles.previewConflict}>
                      {tx.switchMerchantBody(cart.merchantName, preview.companyName)}
                    </Text>
                    <Pressable style={styles.previewDanger} onPress={confirmReplace}>
                      <Text style={styles.previewDangerText}>{tx.emptyAndAdd}</Text>
                    </Pressable>
                    <Pressable onPress={closePreview}>
                      <Text style={styles.previewCancel}>{tx.cancel}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable style={styles.previewAdd} onPress={confirmAdd}>
                      <Text style={styles.previewAddText}>{tx.addToCartAt(money(preview.price))}</Text>
                    </Pressable>
                    <Pressable onPress={closePreview}>
                      <Text style={styles.previewCancel}>{tx.cancel}</Text>
                    </Pressable>
                  </>
                )}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

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

      <BottomNav active="explore" />
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

  // The tapped product's confirm sheet.
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewImage: { width: 92, height: 92, borderRadius: 12, backgroundColor: t.cardStrong },
  previewImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  previewEmoji: { fontSize: 38 },
  previewName: { fontSize: 17, fontWeight: '900', color: t.text },
  previewCompany: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 2 },
  previewPrice: { fontSize: 20, fontWeight: '900', color: t.text, marginTop: 6 },
  previewDescription: { fontSize: 14, color: t.textMuted, lineHeight: 20, marginTop: 12 },
  previewConflict: { fontSize: 14, color: t.text, fontWeight: '700', lineHeight: 20, marginTop: 14 },
  previewAdd: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  previewAddText: { color: t.onAccent, fontSize: 16, fontWeight: '900' },
  previewDanger: { backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  previewDangerText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  previewCancel: { color: t.textMuted, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },

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

  cats: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 16 },
  catTile: { alignItems: 'center', width: 72 },
  catCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: t.card, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: t.border,
  },
  catCircleActive: { borderColor: t.accent, backgroundColor: t.cardStrong },
  // Skeleton stand-ins for the row above, matching the circle and label dimensions so the swap to
  // real chips does not shift the header. `cats` is a contentContainerStyle, so the plain View
  // needs the row direction it would have inherited from the ScrollView.
  catsSkeletonRow: { flexDirection: 'row', overflow: 'hidden' },
  catSkeletonCircle: { width: 60, height: 60, borderRadius: 30 },
  catSkeletonLabel: { height: 10, borderRadius: 5, width: 48, marginTop: 8 },
  catEmoji: { fontSize: 26 },
  catLabel: { fontSize: 12, color: t.textMuted, marginTop: 6, fontWeight: '600' },
  catLabelActive: { color: t.text, fontWeight: '800' },

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
  orderChipTotal: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 6 },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: t.text, paddingHorizontal: 16, marginTop: 26, marginBottom: 12 },
  focusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12, backgroundColor: t.card,
    borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  focusBack: { color: t.text, fontWeight: '800', fontSize: 14 },
  focusTitle: { color: t.text, fontWeight: '800', fontSize: 14 },
  focusHint: { color: t.textMuted, fontSize: 12, marginTop: 2 },
  focusAction: {
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7,
  },
  focusActionText: { color: t.text, fontWeight: '800', fontSize: 13 },
  storeChevron: { color: t.text, fontSize: 26, fontWeight: '800', marginLeft: 4 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 12 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  footerLoading: { paddingVertical: 18, alignItems: 'center' },

  // Two tiles across. The row supplies the gutters; each tile just fills its half.
  gridRow: { gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  tile: {
    flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    borderRadius: 14, overflow: 'hidden',
  },
  tileThumb: { height: 84, backgroundColor: t.cardStrong, justifyContent: 'center', alignItems: 'center' },
  // Skeleton stand-ins sized like a real tile's contents, so nothing jumps when the page lands.
  // The thumb keeps square corners -- the tile's own overflow:hidden rounds it, like the photo.
  tileSkeletonThumb: { height: 84, borderRadius: 0 },
  tileSkeletonLine: { height: 12, borderRadius: 6, marginBottom: 8 },
  tileSkeletonLineShort: { height: 12, borderRadius: 6, width: '55%' },
  tileThumbEmoji: { fontSize: 34 },
  tileBody: { padding: 10 },
  // No reserved second line: a one-line name would otherwise leave a blank one above the merchant.
  // Tiles in a row still match height (the row stretches them); the slack sits at the bottom of the
  // shorter card instead of inside the text block.
  tileName: { fontSize: 14, fontWeight: '700', color: t.text, lineHeight: 17 },
  tileCompany: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  tilePrice: { flex: 1, fontSize: 15, fontWeight: '800', color: t.text },

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
