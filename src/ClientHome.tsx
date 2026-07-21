import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Order, Product } from './api';
import { useCart } from './cart';
import { GradientBackground, GRADIENT, t } from './theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { BottomNav, BOTTOM_NAV_HEIGHT } from './BottomNav';

// A PedidosYa-styled marketplace home: a red header band with the delivery location and search, the
// ERP business-category row, and products from every merchant (GET /delivery/products) grouped by
// store. Adding a product to the cart is blocked across merchants (one order, one merchant).

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

interface StoreGroup {
  companyId: string;
  companyName: string;
  categories: string[];
  products: Product[];
}

export function ClientHome({ profile }: { profile: Me | null }) {
  const router = useRouter();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<api.BusinessCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Loads the catalog, optionally narrowed to one merchant (server-side, via ?companyId).
  const loadProducts = (companyId?: string) => {
    setLoading(true);
    api.products(companyId)
      .then((res) => { if (res.success) setProducts(res.data ?? []); })
      .finally(() => setLoading(false));
  };

  // The category row is driven by the ERP business categories; the catalog by the products endpoint.
  useEffect(() => {
    api.businessCategories().then((res) => {
      if (res.success) setCategories((res.data ?? []).filter((c) => c.active));
    });
    loadProducts();
  }, []);

  // Once the parent refetches the profile (on focus, e.g. back from adding an address), that is the
  // truth again -- drop the local echo so a newer default cannot be masked by a stale pick.
  useEffect(() => { setChosen(null); }, [profile?.address, profile?.addressLabel]);

  const selectCompany = (id: string, name: string) => { setSelectedCompany({ id, name }); loadProducts(id); };
  const clearCompany = () => { setSelectedCompany(null); loadProducts(); };

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

  // Filter products by the selected category (merchant's categories) + search, then group by store.
  const stores: StoreGroup[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const catName = category === 'all' ? null : (categories.find((c) => c.id === category)?.name.toLowerCase() ?? null);
    const filtered = products.filter((p) => {
      const inCategory = !catName || p.categories.some((c) => c.toLowerCase() === catName);
      const matches = !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
      return inCategory && matches;
    });
    const byStore = new Map<string, StoreGroup>();
    for (const p of filtered) {
      if (!byStore.has(p.companyId)) {
        byStore.set(p.companyId, { companyId: p.companyId, companyName: p.companyName, categories: p.categories, products: [] });
      }
      byStore.get(p.companyId)!.products.push(p);
    }
    return [...byStore.values()];
  }, [products, search, category, categories]);

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
            <Pressable style={{ flex: 1 }} onPress={openAddresses} accessibilityRole="button">
              <Text style={styles.deliverLabel}>Enviar a</Text>
              <View style={styles.addressRow}>
                <Text style={styles.pin}>📍</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {/* The name the customer gave it ("Casa"); the raw address only stands in when
                      there is no saved label to show. */}
                  {addressLabel || address || 'Agrega tu dirección de entrega'}
                </Text>
                <Text style={styles.chevron}>⌄</Text>
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

      <ScrollView style={styles.body} contentContainerStyle={[styles.scroll, cart.count > 0 && { paddingBottom: 96 }]} showsVerticalScrollIndicator={false}>
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

        <Text style={styles.sectionTitle}>{selectedCompany ? selectedCompany.name : 'Comercios'}</Text>

        {selectedCompany ? (
          <Pressable style={styles.focusBanner} onPress={clearCompany}>
            <Text style={styles.focusBack}>‹ Todos los comercios</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={t.text} /></View>
        ) : stores.length === 0 ? (
          <Text style={styles.empty}>No encontramos productos para tu búsqueda.</Text>
        ) : (
          stores.map((s) => (
            <View key={s.companyId} style={styles.card}>
              <Pressable style={styles.storeHeader} onPress={() => selectCompany(s.companyId, s.companyName)}>
                <Text style={styles.storeEmoji}>{emojiFor(s.categories[0] ?? s.companyName)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName} numberOfLines={1}>{s.companyName}</Text>
                  <Text style={styles.storeCats} numberOfLines={1}>{s.categories.join(' · ') || 'Comercio'}</Text>
                </View>
                {!selectedCompany ? <Text style={styles.storeChevron}>›</Text> : null}
              </Pressable>
              {s.products.map((p) => (
                <View key={p.id} style={styles.productRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                    {p.description ? <Text style={styles.productDesc} numberOfLines={1}>{p.description}</Text> : null}
                    <Text style={styles.productPrice}>{money(p.price)}</Text>
                  </View>
                  <Pressable style={styles.addBtn} onPress={() => onAdd(p)} accessibilityLabel={`Agregar ${p.name}`}>
                    <FontAwesome5 name="cart-plus" size={16} color={t.onAccent} />
                  </Pressable>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

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
            <Text style={styles.sheetTitle}>Enviar a</Text>
            {addresses.map((item) => {
              const active = chosen ? item.label === chosen.label && item.address === chosen.address : item.isDefault;
              return (
                <Pressable
                  key={item.id ?? item.address}
                  style={styles.sheetRow}
                  onPress={() => chooseDefault(item)}
                  disabled={!!addrBusy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={styles.sheetPin}>📍</Text>
                  <View style={{ flex: 1 }}>
                    {item.label ? <Text style={styles.sheetLabel}>{item.label}</Text> : null}
                    <Text style={styles.sheetAddress} numberOfLines={1}>{item.address}</Text>
                  </View>
                  {addrBusy === item.id
                    ? <ActivityIndicator color={t.text} size="small" />
                    : active ? <Text style={styles.sheetCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
            <Pressable style={styles.sheetAdd} onPress={addAddress} accessibilityRole="button">
              <Text style={styles.sheetAddIcon}>＋</Text>
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

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: GRADIENT[0], borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 4 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  sheetPin: { fontSize: 16 },
  sheetLabel: { fontSize: 15, fontWeight: '800', color: t.text },
  sheetAddress: { fontSize: 13, color: t.textMuted, marginTop: 1 },
  sheetCheck: { fontSize: 18, fontWeight: '900', color: t.accent },
  sheetAdd: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  sheetAddIcon: { fontSize: 20, fontWeight: '900', color: t.accent, width: 20, textAlign: 'center' },
  sheetAddText: { fontSize: 15, fontWeight: '800', color: t.accent },
  deliverLabel: { fontSize: 12, color: t.textMuted, fontWeight: '600' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pin: { fontSize: 13, marginRight: 4 },
  address: { fontSize: 16, fontWeight: '800', color: t.text, flexShrink: 1 },
  chevron: { fontSize: 16, color: t.text, marginLeft: 4, marginTop: -4 },
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
  focusBanner: { marginHorizontal: 16, marginBottom: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  focusBack: { color: t.text, fontWeight: '800', fontSize: 14 },
  storeChevron: { color: t.text, fontSize: 26, fontWeight: '800', marginLeft: 4 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 12 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },

  card: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, marginHorizontal: 16, marginBottom: 14, borderRadius: 16, overflow: 'hidden',
  },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: t.cardStrong },
  storeEmoji: { fontSize: 30 },
  storeName: { fontSize: 16, fontWeight: '800', color: t.text },
  storeCats: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.border },
  productName: { fontSize: 15, fontWeight: '700', color: t.text },
  productDesc: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  productPrice: { fontSize: 15, fontWeight: '800', color: t.text, marginTop: 4 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: t.onAccent, fontSize: 22, fontWeight: '800', lineHeight: 24 },

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
