import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as api from './api';
import type { Me, Product } from './api';
import { useCart } from './cart';

// A PedidosYa-styled marketplace home: a red header band with the delivery location and search, the
// ERP business-category row, and products from every merchant (GET /delivery/products) grouped by
// store. Adding a product to the cart is blocked across merchants (one order, one merchant).

// PedidosYa's signature palette: a vivid rose-red on light-grey surfaces.
const RED = '#FA0050';

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

const STORE_COLORS = ['#FA0050', '#f59e0b', '#0ea5e9', '#22c55e', '#8b5cf6', '#ef4444', '#14b8a6'];
const colorFor = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return STORE_COLORS[h % STORE_COLORS.length];
};

const money = (n: number) => `RD$${n.toFixed(2)}`;

interface StoreGroup {
  companyId: string;
  companyName: string;
  categories: string[];
  products: Product[];
}

export function ClientHome({ profile, onSignOut }: { profile: Me | null; onSignOut: () => void }) {
  const router = useRouter();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState<api.BusinessCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);

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

  const selectCompany = (id: string, name: string) => { setSelectedCompany({ id, name }); loadProducts(id); };
  const clearCompany = () => { setSelectedCompany(null); loadProducts(); };

  const categoryChips: Category[] = useMemo(() => [
    { key: 'all', label: 'Todos', emoji: '🍽️' },
    ...categories.map((c) => ({ key: c.id, label: c.name, emoji: emojiFor(c.name) })),
  ], [categories]);

  const fullName = profile?.name?.trim() || '';
  const greeting = fullName.split(' ')[0] || profile?.email || '';
  const address = profile?.address?.trim();
  const initial = (fullName || profile?.email || '?').charAt(0).toUpperCase();

  const soon = (label: string) => { setMenuOpen(false); Alert.alert(label, 'Disponible próximamente.'); };

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
    <View style={styles.root}>
      {/* Red header band: location + search, PedidosYa style. */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.headerBand}>
          <View style={styles.locationRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deliverLabel}>Enviar a</Text>
              <View style={styles.addressRow}>
                <Text style={styles.pin}>📍</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {address || 'Agrega tu dirección de entrega'}
                </Text>
                <Text style={styles.chevron}>⌄</Text>
              </View>
            </View>
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.menuBtn} accessibilityLabel="Abrir menú">
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar productos"
              placeholderTextColor="#9ca3af"
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

        <Text style={styles.sectionTitle}>{selectedCompany ? selectedCompany.name : 'Comercios'}</Text>

        {selectedCompany ? (
          <Pressable style={styles.focusBanner} onPress={clearCompany}>
            <Text style={styles.focusBack}>‹ Todos los comercios</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={RED} /></View>
        ) : stores.length === 0 ? (
          <Text style={styles.empty}>No encontramos productos para tu búsqueda.</Text>
        ) : (
          stores.map((s) => (
            <View key={s.companyId} style={styles.card}>
              <Pressable style={[styles.storeHeader, { backgroundColor: colorFor(s.companyId) }]} onPress={() => selectCompany(s.companyId, s.companyName)}>
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
                    <Text style={styles.addBtnText}>+</Text>
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

      {/* Account menu: slides over from the right; the exit (Cerrar sesión) action lives here. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} accessibilityLabel="Cerrar menú" />
          <SafeAreaView edges={['top', 'bottom']} style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerName} numberOfLines={1}>{fullName || 'Cliente'}</Text>
                {profile?.email ? <Text style={styles.drawerEmail} numberOfLines={1}>{profile.email}</Text> : null}
              </View>
            </View>

            <View style={styles.menuList}>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/orders'); }}>
                <Text style={styles.menuItemIcon}>🧾</Text>
                <Text style={styles.menuItemText}>Mis pedidos</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/addresses'); }}>
                <Text style={styles.menuItemIcon}>📍</Text>
                <Text style={styles.menuItemText}>Direcciones</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={() => soon('Ayuda')}>
                <Text style={styles.menuItemIcon}>❓</Text>
                <Text style={styles.menuItemText}>Ayuda</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }} />

            <Pressable style={styles.logout} onPress={() => { setMenuOpen(false); onSignOut(); }}>
              <Text style={styles.logoutIcon}>⎋</Text>
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f6' },
  headerSafe: { backgroundColor: RED },
  headerBand: { backgroundColor: RED, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  deliverLabel: { fontSize: 12, color: '#ffd6e4', fontWeight: '600' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pin: { fontSize: 13, marginRight: 4 },
  address: { fontSize: 16, fontWeight: '800', color: '#fff', flexShrink: 1 },
  chevron: { fontSize: 16, color: '#fff', marginLeft: 4, marginTop: -4 },
  menuBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  menuIcon: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 9,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },

  body: { flex: 1 },
  scroll: { paddingBottom: 32 },
  hello: { fontSize: 22, fontWeight: '800', color: '#111827', paddingHorizontal: 16, marginTop: 18 },

  cats: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 16 },
  catTile: { alignItems: 'center', width: 72 },
  catCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' as any } : { elevation: 2 }),
  },
  catCircleActive: { borderColor: RED, backgroundColor: '#ffe4ee' },
  catEmoji: { fontSize: 26 },
  catLabel: { fontSize: 12, color: '#374151', marginTop: 6, fontWeight: '600' },
  catLabelActive: { color: RED, fontWeight: '800' },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', paddingHorizontal: 16, marginTop: 26, marginBottom: 12 },
  focusBanner: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#ffe4ee', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  focusBack: { color: RED, fontWeight: '800', fontSize: 14 },
  storeChevron: { color: '#fff', fontSize: 26, fontWeight: '800', marginLeft: 4 },
  empty: { color: '#6b7280', fontSize: 14, textAlign: 'center', paddingHorizontal: 24, marginTop: 12 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 14, borderRadius: 16, overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 6px rgba(0,0,0,0.08)' as any } : { elevation: 2 }),
  },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  storeEmoji: { fontSize: 30 },
  storeName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  storeCats: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  productName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  productDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  productPrice: { fontSize: 15, fontWeight: '800', color: RED, marginTop: 4 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: RED, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 24 },

  cartBar: {
    position: 'absolute', left: 16, right: 16, bottom: 20, backgroundColor: RED, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(250,0,80,0.4)' as any } : { elevation: 6 }),
  },
  cartCount: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  cartCountText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cartBarText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 16 },
  cartBarTotal: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Account menu drawer
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { flex: 1 },
  drawer: { width: 300, maxWidth: '85%', backgroundColor: '#fff', paddingHorizontal: 20 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: RED, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  drawerName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  drawerEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  menuList: { paddingTop: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  menuItemIcon: { fontSize: 18, width: 22, textAlign: 'center' },
  menuItemText: { fontSize: 16, color: '#111827', fontWeight: '600' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, marginBottom: 8, borderRadius: 12, backgroundColor: '#fff1f5', borderWidth: 1, borderColor: '#ffd6e4' },
  logoutIcon: { fontSize: 16, color: RED },
  logoutText: { fontSize: 16, color: RED, fontWeight: '800' },
});
