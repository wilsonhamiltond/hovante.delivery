import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Order, Product } from './api';
import { useCart } from './cart';
import { GradientBackground, GRADIENT, t } from './theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { BottomNav, BOTTOM_NAV_HEIGHT } from './BottomNav';

// The marketplace home: a header band with the delivery location and search, the business-category
// row, and every merchant's products (GET /delivery/products) as a two-across grid of item tiles.
// Each tile names its own merchant, so the catalog reads as one list of things to buy rather than a
// list of shops. Adding a product to the cart is blocked across merchants (one order, one merchant).

// PedidosYa's signature palette: a vivid rose-red on light-grey surfaces.
interface Category {
  key: string;   // 'all', or a business-category id
  label: string;
  emoji: string;
}

// Business categories come from the ERP with only a name, so pick an icon by keyword.
const CATEGORY_EMOJI: { kw: string; emoji: string }[] = [
  { kw: 'restaur', emoji: '🍽️' }, { kw: 'comida', emoji: '🍽️' }, { kw: 'pizz', emoji: '🍕' },
  { kw: 'farmac', emoji: '💊' }, { kw: 'salud', emoji: '💊' },
  { kw: 'super', emoji: '🛒' }, { kw: 'mercado', emoji: '🛒' }, { kw: 'vivere', emoji: '🛒' },
  { kw: 'cafe', emoji: '☕' }, { kw: 'café', emoji: '☕' }, { kw: 'belle', emoji: '💄' },
  { kw: 'licor', emoji: '🍷' }, { kw: 'bebid', emoji: '🍷' }, { kw: 'ferret', emoji: '🔧' },
  { kw: 'ropa', emoji: '👕' }, { kw: 'tecno', emoji: '💻' }, { kw: 'flor', emoji: '💐' },
  { kw: 'postre', emoji: '🍰' }, { kw: 'pollo', emoji: '🍗' },
];

const emojiFor = (name?: string): string => {
  const n = (name ?? '').toLowerCase();
  return CATEGORY_EMOJI.find((e) => n.includes(e.kw))?.emoji ?? '🏪';
};

const money = (n: number) => `RD$${n.toFixed(2)}`;

// Delivery statuses that mean the order is finished -- excluded from the "current orders" row.
const DONE_STATUSES = ['DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'];

// A short status label for the in-progress order chip, mirroring the tracking timeline phases.
const orderStatusLabel = (o: Order): string => {
  if (o.deliveryStatus === 'IN_TRANSIT') return 'En camino';
  if (o.deliveryStatus === 'ASSIGNED') return 'Repartidor asignado';
  if (o.status === 'READY') return 'Buscando repartidor';
  if (o.status === 'CONFIRMED') return 'Pedido confirmado';
  return 'Esperando al comercio';
};

// The grid is two across, so an odd number of products would leave the last one stretched over the
// full width. Padding the data with a null lets that slot render as an empty tile of equal size.
type GridCell = Product | null;

export function ClientHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<api.BusinessCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Paging state: the debounced search actually sent, whether another page exists, and whether one
  // is in flight. requestId retires the results of a filter the person has already moved on from.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // The delivery-address dropdown: the saved list, and a local echo of the chosen default so the
  // header updates the instant it is switched, before the parent refetches the profile.
  const [addrOpen, setAddrOpen] = useState(false);
  const [addresses, setAddresses] = useState<api.AddressHistory[]>([]);
  const [addrBusy, setAddrBusy] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ label: string | null; address: string | null } | null>(null);

  // The customer's in-progress orders, for the row under the categories. Refetched whenever the home
  // regains focus (after placing an order or coming back from tracking), so their state stays live.
  const loadOrders = useCallback(() => {
    api.myOrders().then((res) => {
      if (res.success) {
        setOrders((res.data ?? []).filter(
          (o) => o.status !== 'CANCELLED' && !DONE_STATUSES.includes(o.deliveryStatus ?? ''),
        ));
      }
    });
  }, []);
  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  // The category row is driven by the business categories the marketplace exposes.
  useEffect(() => {
    api.businessCategories().then((res) => {
      if (res.success) setCategories((res.data ?? []).filter((c) => c.active));
    });
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

  const fetchPage = useCallback(async (skip: number) => {
    const mine = ++requestId.current;
    const res = await api.products({
      companyId: activeCompanyId,
      businessCategoryId,
      search: debouncedSearch,
      skip,
      take: api.PRODUCT_PAGE_SIZE,
    });
    // A slower response for an older filter must not overwrite a newer one's results.
    if (mine !== requestId.current) return;
    const page = res.success ? (res.data ?? []) : [];
    setProducts((prev) => (skip === 0 ? page : [...prev, ...page]));
    // A short page is the end of the catalog; a full one means there may be more.
    setHasMore(page.length === api.PRODUCT_PAGE_SIZE);
  }, [activeCompanyId, businessCategoryId, debouncedSearch]);

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

  // Both only set state: the effect above notices and reloads from the first page.
  const selectCompany = (id: string, name: string) => setSelectedCompany({ id, name });
  const clearCompany = () => setSelectedCompany(null);

  const categoryChips: Category[] = useMemo(() => [
    { key: 'all', label: 'Todos', emoji: '🍽️' },
    ...categories.map((c) => ({ key: c.id, label: c.name, emoji: emojiFor(c.name) })),
  ], [categories]);

  const fullName = profile?.name?.trim() || '';
  const greeting = fullName.split(' ')[0] || profile?.email || '';
  // The local echo wins while it is set (right after switching); otherwise the profile is truth.
  const address = (chosen ? chosen.address : profile?.address)?.trim();
  const addressLabel = (chosen ? chosen.label : profile?.addressLabel)?.trim();

  const openAddresses = () => {
    setAddrOpen(true);
    api.myAddresses().then((res) => { if (res.success) setAddresses(res.data ?? []); });
  };

  const chooseDefault = async (item: api.AddressHistory) => {
    if (!item.id || item.isDefault) { setAddrOpen(false); return; }
    setAddrBusy(item.id);
    const res = await api.setDefaultAddress(item.id);
    setAddrBusy(null);
    if (!res.success) { Alert.alert('Dirección', res.message); return; }
    setChosen({ label: item.label, address: item.address });
    setAddrOpen(false);
  };

  const addAddress = () => { setAddrOpen(false); router.push('/address-new'); };

  // No client-side filtering left: the server returns exactly the page asked for. The list is not
  // grouped by store either -- every tile names its own merchant, so the catalog reads as one list
  // of things to buy.
  const gridData: GridCell[] = useMemo(
    () => (products.length % 2 === 1 ? [...products, null] : products),
    [products],
  );

  const onAdd = (p: Product) => {
    if (cart.tryAdd(p) === 'conflict') {
      Alert.alert(
        'Cambiar de comercio',
        `Tu carrito tiene productos de ${cart.merchantName}. ¿Vaciarlo y agregar de ${p.companyName}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Vaciar y agregar', style: 'destructive', onPress: () => cart.replaceWith(p) },
        ],
      );
    }
  };

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
              <Text style={styles.deliverLabel}>Enviar a</Text>
              <Text style={styles.address} numberOfLines={1}>
                {/* The name the customer gave it ("Casa"); the raw address only stands in when
                    there is no saved label to show. */}
                {addressLabel || address || 'Agrega tu dirección'}
              </Text>
              {/* A real icon rather than the "⌄" glyph, which sits off the baseline and needed a
                  negative margin to look level. */}
              <View style={styles.chevronWrap}>
                <FontAwesome5 name="chevron-down" size={9} color={t.text} />
              </View>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar productos"
              placeholderTextColor={t.textFaint}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>
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
        contentContainerStyle={[styles.scroll, cart.count > 0 && { paddingBottom: 96 }]}
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
            <View style={styles.tile}>
              {/* No product images yet: imagePath is a storage key and most items have none, so
                  the thumbnail stands in with the merchant's category icon. */}
              <View style={styles.tileThumb}>
                <Text style={styles.tileThumbEmoji}>{emojiFor(item.categories[0] ?? item.companyName)}</Text>
              </View>
              <View style={styles.tileBody}>
                <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
                <Pressable onPress={() => selectCompany(item.companyId, item.companyName)}>
                  <Text style={styles.tileCompany} numberOfLines={1}>{item.companyName}</Text>
                </Pressable>
                <View style={styles.tileFooter}>
                  <Text style={styles.tilePrice}>{money(item.price)}</Text>
                  <Pressable
                    style={styles.tileAdd}
                    onPress={() => onAdd(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar ${item.name}`}
                  >
                    <FontAwesome5 name="cart-plus" size={14} color={t.onAccent} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading
            ? <View style={styles.loadingBox}><ActivityIndicator color={t.text} /></View>
            : <Text style={styles.empty}>No encontramos productos para tu búsqueda.</Text>
        }
        ListHeaderComponent={
          <>
        <Text style={styles.hello}>¡Hola, {greeting}! 👋</Text>

        {/* Circular category tiles */}
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

        {/* Current orders: a line of in-progress orders under the categories; tap one to track it. */}
        {orders.length > 0 ? (
          <View style={styles.ordersSection}>
            <Text style={styles.ordersTitle}>Tus pedidos en curso</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ordersRow}>
              {orders.map((o) => (
                <Pressable key={o.id} style={styles.orderChip} onPress={() => router.push(`/order/${o.id}`)}>
                  <View style={styles.orderChipTop}>
                    <Text style={styles.orderChipNumber}>{o.orderNumber}</Text>
                    <Text style={styles.orderChipArrow}>›</Text>
                  </View>
                  <Text style={styles.orderChipMerchant} numberOfLines={1}>{o.merchantName ?? 'Comercio'}</Text>
                  <Text style={styles.orderChipStatus} numberOfLines={1}>{orderStatusLabel(o)}</Text>
                  <Text style={styles.orderChipTotal}>{money(o.total)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>
          {cart.merchantName ?? selectedCompany?.name ?? 'Productos'}
        </Text>

        {/* Why the catalog is showing one merchant. Locked by the cart it explains itself and
            offers the only way out (emptying it); picked by hand it is just a step back. */}
        {cart.merchantId ? (
          <View style={styles.focusBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusTitle}>Tu pedido es de {cart.merchantName}</Text>
              <Text style={styles.focusHint}>Solo puedes pedir de un comercio a la vez</Text>
            </View>
            <Pressable
              style={styles.focusAction}
              onPress={() => cart.clear()}
              accessibilityRole="button"
            >
              <Text style={styles.focusActionText}>Vaciar</Text>
            </Pressable>
          </View>
        ) : selectedCompany ? (
          <Pressable style={styles.focusBanner} onPress={clearCompany}>
            <Text style={styles.focusBack}>‹ Todos los comercios</Text>
          </Pressable>
        ) : null}
          </>
        }
      />

      {/* Cart bar: appears once the cart has something; opens the order screen. */}
      {cart.count > 0 ? (
        <Pressable style={styles.cartBar} onPress={() => router.push('/cart')}>
          <View style={styles.cartCount}><Text style={styles.cartCountText}>{cart.count}</Text></View>
          <Text style={styles.cartBarText}>Ver pedido</Text>
          <Text style={styles.cartBarTotal}>{money(cart.total)}</Text>
        </Pressable>
      ) : null}

      {/* Delivery-address picker: pick which saved address to deliver to, or add a new one. */}
      <Modal visible={addrOpen} transparent animationType="slide" onRequestClose={() => setAddrOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAddrOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Enviar a</Text>
                <Text style={styles.sheetSubtitle}>Elige dónde quieres recibir tu pedido</Text>
              </View>
              {/* An explicit way out: tapping the backdrop works, but is not discoverable. */}
              <Pressable
                style={styles.sheetClose}
                onPress={() => setAddrOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Text style={styles.sheetCloseIcon}>✕</Text>
              </Pressable>
            </View>

            {addresses.length === 0 ? (
              <Text style={styles.sheetEmpty}>Todavía no tienes direcciones guardadas.</Text>
            ) : null}

            {addresses.map((item) => {
              const active = chosen ? item.label === chosen.label && item.address === chosen.address : item.isDefault;
              const busy = addrBusy === item.id;
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
                    {item.label ? <Text style={styles.sheetLabel}>{item.label}</Text> : null}
                    <Text style={styles.sheetAddress} numberOfLines={2}>{item.address}</Text>
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
              <Text style={styles.sheetAddText}>Agregar nueva dirección</Text>
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
  headerSafe: { backgroundColor: 'transparent' },
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
  sheetAddress: { fontSize: 13, color: t.textMuted, marginTop: 1, lineHeight: 17 },
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
  orderChipStatus: { fontSize: 13, fontWeight: '700', color: t.text, marginTop: 4 },
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
  tileThumbEmoji: { fontSize: 34 },
  tileBody: { padding: 10 },
  // No reserved second line: a one-line name would otherwise leave a blank one above the merchant.
  // Tiles in a row still match height (the row stretches them); the slack sits at the bottom of the
  // shorter card instead of inside the text block.
  tileName: { fontSize: 14, fontWeight: '700', color: t.text, lineHeight: 17 },
  tileCompany: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  tileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  tilePrice: { flex: 1, fontSize: 15, fontWeight: '800', color: t.text },
  tileAdd: { width: 30, height: 30, borderRadius: 15, backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' },

  cartBar: {
    // Floats just above the bottom tab bar.
    position: 'absolute', left: 16, right: 16, bottom: BOTTOM_NAV_HEIGHT + 14, backgroundColor: t.accent, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.35)' as any } : { elevation: 6 }),
  },
  cartCount: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(29,78,216,0.15)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  cartCountText: { color: t.onAccent, fontWeight: '800', fontSize: 14 },
  cartBarText: { flex: 1, color: t.onAccent, fontWeight: '800', fontSize: 16 },
  cartBarTotal: { color: t.onAccent, fontWeight: '800', fontSize: 16 },

});
