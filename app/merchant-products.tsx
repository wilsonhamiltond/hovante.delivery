import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as api from '../src/api';
import type { Product } from '../src/api';
import { emojiFor } from '../src/categoryEmoji';
import { takeFlash } from '../src/flash';
import { GradientBackground, t } from '../src/theme';
import { MerchantTopBar } from '../src/MerchantTopBar';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    deleted: string;
    title: string;
    subtitle: string;
    newBtn: string;
    searchPlaceholder: string;
    emptySearch: (query: string) => string;
    emptyCatalogue: string;
    unavailable: string;
    edit: string;
    remove: string;
    deleteTitle: string;
    deleteBody: string;
    deleteYes: string;
    no: string;
  }
> = {
  es: {
    deleted: 'Producto eliminado.',
    title: 'Productos',
    subtitle: 'Lo que tu comercio vende en la app',
    newBtn: '+ Nuevo',
    searchPlaceholder: 'Buscar por nombre',
    emptySearch: (query) => `Ningún producto coincide con “${query}”.`,
    emptyCatalogue: 'Tu comercio todavía no tiene productos. Toca “+ Nuevo” para agregar el primero.',
    unavailable: 'No disponible',
    edit: '✏️ Editar',
    remove: '🗑️ Eliminar',
    deleteTitle: '¿Eliminar producto?',
    deleteBody: 'Si ya tiene pedidos, se retirará de la venta en lugar de borrarse.',
    deleteYes: 'Sí, eliminar',
    no: 'No',
  },
  en: {
    deleted: 'Product deleted.',
    title: 'Products',
    subtitle: 'What your business sells in the app',
    newBtn: '+ New',
    searchPlaceholder: 'Search by name',
    emptySearch: (query) => `No products match “${query}”.`,
    emptyCatalogue: 'Your business has no products yet. Tap “+ New” to add the first one.',
    unavailable: 'Unavailable',
    edit: '✏️ Edit',
    remove: '🗑️ Delete',
    deleteTitle: 'Delete product?',
    deleteBody: 'If it already has orders, it will be taken off sale instead of being deleted.',
    deleteYes: 'Yes, delete',
    no: 'No',
  },
};

// The merchant's own catalogue as an infinite scroll, and the counter's way to maintain it: add a
// product, edit what it is called or costs, take it off sale, or remove it. Items NOT on sale are
// listed too, marked as such -- a shopkeeper needs to see those as much as the ones selling.
// Everything else about an item (SKU, tax, type, stock) stays in the ERP.
// Adding and editing happen on their own page (merchant-product/[id]); this screen only lists.

const money = (n: number) => `RD$${n.toFixed(2)}`;

export default function MerchantProductsScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // What is typed, and what has actually been searched for. They differ while the driver is still
  // typing: the query only settles 350 ms after the last keystroke, so a name is one request
  // rather than one per letter.
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Deleting asks first: the row is gone from the counter's list either way, and a mis-tap on a
  // phone should not be able to take a product off sale silently.
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    const res = await api.merchantProducts(0, api.PRODUCT_PAGE_SIZE, query);
    if (!res.success) { setError(res.message); return; }
    setError(null);
    const rows = res.data ?? [];
    setProducts(rows);
    // A short page means the catalogue is exhausted; a full one may have more behind it.
    setHasMore(rows.length === api.PRODUCT_PAGE_SIZE);
  }, [query]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    // A confirmation left by the form page as it navigated back ("Guardado."), shown above the
    // rows the reload below is about to refresh.
    const flash = takeFlash();
    if (flash) setNotice(flash);
    loadFirstPage().finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [loadFirstPage]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    // The same query the page was filled with, or scrolling a search would append the unfiltered
    // catalogue underneath the matches.
    const res = await api.merchantProducts(products.length, api.PRODUCT_PAGE_SIZE, query);
    setLoadingMore(false);
    if (!res.success) return;
    const rows = res.data ?? [];
    // Deduped by id: an item renamed between pages shifts the by-name offsets, and appending a row
    // the list already shows would crash the keyExtractor.
    setProducts((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setHasMore(rows.length === api.PRODUCT_PAGE_SIZE);
  };

  const openCreate = () => {
    setNotice(null);
    router.push('/merchant-product/new');
  };

  // The form page has no single-product read to lean on, so the row's current fields ride along as
  // route params -- the list already holds everything the form shows.
  const openEdit = (p: Product) => {
    setNotice(null);
    router.push({
      pathname: '/merchant-product/[id]',
      params: {
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        price: String(p.price),
        active: String(p.active !== false),
        imageUrl: p.imageUrl ?? '',
      },
    });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    const res = await api.deleteMerchantProduct(deleting.id);
    setDeletingBusy(false);
    setDeleting(null);
    // The server retires a product that already has orders rather than erasing it, and says so --
    // so its message is shown rather than a blanket "eliminado".
    setNotice(res.success ? (res.message || tx.deleted) : res.message);
    if (res.success) await loadFirstPage();
  };

  return (
    <GradientBackground>
    <View style={styles.safe}>
      {/* The same "🏪 comercio" bar the home wears; the top safe area rides inside it. */}
      <MerchantTopBar />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{tx.title}</Text>
          <Text style={styles.subtitle}>{tx.subtitle}</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={openCreate} accessibilityRole="button">
          <Text style={styles.newBtnText}>{tx.newBtn}</Text>
        </Pressable>
      </View>

      {/* Searched server-side, so it finds products anywhere in the catalogue -- not only the
          pages already scrolled to. */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔎</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={tx.searchPlaceholder}
          placeholderTextColor={t.textFaint}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {notice ? (
        <Pressable onPress={() => setNotice(null)}>
          <Text style={styles.notice}>{notice}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query
                ? tx.emptySearch(query)
                : tx.emptyCatalogue}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={t.text} /> : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {/* No product images yet: imagePath is a storage key and most items have none, so the
                    thumbnail stands in with the merchant's category icon, as the catalogue does. */}
                {/* The product's own photo once it has one; the merchant's category icon stands in
                    for the ones that do not, as the client catalogue does. */}
                {item.imageUrl ? (
                  // contain, so the whole product is visible rather than a crop of its middle.
                  <Image source={{ uri: item.imageUrl }} style={styles.thumb} resizeMode="contain" />
                ) : (
                  <View style={styles.thumb}>
                    <Text style={styles.thumbEmoji}>{emojiFor(item.categories[0] ?? item.companyName)}</Text>
                  </View>
                )}
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                  <View style={styles.footer}>
                    <Text style={styles.price}>{money(item.price)}</Text>
                    {/* Only the exception is worn: an item on sale needs no badge saying so. */}
                    {item.active === false ? (
                      <View style={styles.chip}><Text style={styles.chipText}>{tx.unavailable}</Text></View>
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={styles.cardActions}>
                <Pressable style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.editText}>{tx.edit}</Text>
                </Pressable>
                <Pressable style={styles.deleteBtn} onPress={() => { setNotice(null); setDeleting(item); }}>
                  <Text style={styles.deleteText}>{tx.remove}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {/* Delete confirmation */}
      <Modal visible={deleting != null} transparent animationType="fade" onRequestClose={() => setDeleting(null)}>
        <Pressable style={styles.scrim} onPress={() => setDeleting(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{tx.deleteTitle}</Text>
            <Text style={styles.confirmText}>
              {deleting?.name}{'\n'}
              {tx.deleteBody}
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.danger, deletingBusy && styles.disabled]}
                disabled={deletingBusy}
                onPress={confirmDelete}
              >
                {deletingBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerText}>{tx.deleteYes}</Text>}
              </Pressable>
              <Pressable style={styles.neutral} disabled={deletingBusy} onPress={() => setDeleting(null)}>
                <Text style={styles.neutralText}>{tx.no}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNav active="products" variant="merchant" />
    </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 2, fontWeight: '600' },
  newBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  newBtnText: { color: t.onAccent, fontWeight: '900', fontSize: 14 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, color: t.text, fontSize: 15, paddingVertical: 9 },
  searchClear: { color: t.textMuted, fontSize: 16, fontWeight: '800', paddingHorizontal: 4 },
  notice: { color: '#bbf7d0', fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  footerSpinner: { marginVertical: 14 },

  card: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: t.cardStrong, justifyContent: 'center', alignItems: 'center' },
  thumbEmoji: { fontSize: 26 },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '800', color: t.text },
  description: { fontSize: 13, color: t.textMuted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  price: { fontSize: 16, fontWeight: '900', color: t.text },
  chip: { backgroundColor: '#64748b', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 },
  editBtn: { flex: 1, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  editText: { color: t.text, fontWeight: '800', fontSize: 13 },
  deleteBtn: { flex: 1, borderWidth: 1, borderColor: 'rgba(252,165,165,0.6)', backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  deleteText: { color: '#fecaca', fontWeight: '800', fontSize: 13 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 4 },
  confirmText: { color: t.textMuted, fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  danger: { flex: 1, backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  neutral: { flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  neutralText: { color: t.text, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
