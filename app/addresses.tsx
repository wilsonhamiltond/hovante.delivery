import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import * as api from '../src/api';
import type { AddressHistory } from '../src/api';
import { useSessionLocation } from '../src/sessionLocation';
import { GradientBackground, t } from '../src/theme';
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../src/BottomNav';

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// The client's addresses: the saved ones first (the default one at the top, set from the sign-up
// location step), then any address seen only on past orders. Reachable from the account menu's
// "Direcciones".
export default function AddressesScreen() {
  const router = useRouter();
  const session = useSessionLocation();
  const [items, setItems] = useState<AddressHistory[]>([]);
  const [loading, setLoading] = useState(true);
  // Which row is being promoted, so only its own button shows a spinner.
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    api.myAddresses().then((res) => {
      if (active && res.success) setItems(res.data ?? []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  // Promote a saved address to the account's default. Only saved rows can be promoted: the list
  // also carries addresses seen on past orders, which exist as text on an order and have no id to
  // point at.
  const makePrimary = async (item: AddressHistory) => {
    if (!item.id || item.isDefault) return;
    setBusyId(item.id);
    const res = await api.setDefaultAddress(item.id);
    if (!res.success) {
      setBusyId(null);
      Alert.alert('Dirección', res.message);
      return;
    }
    // Refetched rather than flipping the flag locally: the server also reorders the list so the
    // default sits on top, and guessing that ordering here would drift from it.
    const list = await api.myAddresses();
    if (list.success) setItems(list.data ?? []);
    setBusyId(null);
    // Naming a new default is an explicit "deliver here", so it retires a session pin the same way
    // choosing an address from the home dropdown does.
    session.clear();
  };

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Direcciones</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.address}
          contentContainerStyle={styles.list}
          ListHeaderComponent={items.length ? <Text style={styles.subtitle}>Tus direcciones guardadas y las que has usado para pedir</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>Aún no tienes direcciones. Las que uses para pedir aparecerán aquí.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.addressRow}>
                  <Text style={[styles.address, { flex: 1 }]}>{item.address}</Text>
                  {item.isDefault ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>Principal</Text></View>
                  ) : null}
                </View>
                {/* A saved address that has never been ordered to has no usage line to show. */}
                <Text style={styles.meta}>
                  {item.lastUsedAt
                    ? `${item.timesUsed === 1 ? 'Usada 1 vez' : `Usada ${item.timesUsed} veces`} · Último pedido ${fmtDate(item.lastUsedAt)}`
                    : item.label ?? 'Guardada'}
                </Text>

                {/* Only a saved address can be promoted -- one seen only on a past order is text on
                    that order, with no id to point the account's default at. */}
                {item.id && !item.isDefault ? (
                  <Pressable
                    style={[styles.primaryBtn, busyId != null && styles.primaryBtnBusy]}
                    onPress={() => makePrimary(item)}
                    disabled={busyId != null}
                    accessibilityRole="button"
                    accessibilityLabel={`Hacer principal ${item.address}`}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator size="small" color={t.text} />
                    ) : (
                      <>
                        <FontAwesome5 name="star" size={11} color={t.text} />
                        <Text style={styles.primaryBtnText}>Hacer principal</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
      <BottomNav active="addresses" />
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: BOTTOM_NAV_HEIGHT + 24 },
  subtitle: { fontSize: 13, color: t.textMuted, marginBottom: 4 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  pin: { fontSize: 18 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { fontSize: 15, fontWeight: '700', color: t.text },
  badge: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: t.onAccent, fontSize: 11, fontWeight: '800' },
  // Outlined rather than filled: the filled accent belongs to the "Principal" badge, and the two
  // sit inches apart -- a second solid block would read as a second badge, not an action.
  primaryBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 10, minHeight: 30, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.cardStrong,
  },
  // While any row is promoting, the others read as unavailable rather than merely inert.
  primaryBtnBusy: { opacity: 0.6 },
  primaryBtnText: { color: t.text, fontSize: 12, fontWeight: '800' },
  meta: { fontSize: 13, color: t.textMuted, marginTop: 4 },
});
