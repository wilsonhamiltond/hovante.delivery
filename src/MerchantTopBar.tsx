import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as api from './api';
import { NotificationsButton } from './NotificationsButton';
import { t } from './theme';

// The merchant screens' shared top bar -- the "🏪 comercio" row with the bell that the home wears,
// so Productos and Historial read as rooms of the same shop. The home already holds the profile and
// passes the name in; the other tabs pass nothing and the bar asks /auth/me itself on focus.
export function MerchantTopBar({ companyName, subtitle }: {
  // undefined = fetch it here; null/string = the caller already knows (the home's profile).
  companyName?: string | null;
  subtitle?: string | null;
}) {
  const [fetched, setFetched] = useState<string | null>(null);
  const needsFetch = companyName === undefined;

  useFocusEffect(useCallback(() => {
    if (!needsFetch) return;
    let alive = true;
    api.me().then((res) => {
      if (alive && res.success) setFetched(res.data?.merchantCompanyName ?? null);
    });
    return () => { alive = false; };
  }, [needsFetch]));

  const name = (needsFetch ? fetched : companyName) ?? 'Tu comercio';

  return (
    <SafeAreaView edges={['top']} style={styles.headerSafe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.hello} numberOfLines={1}>🏪 {name}</Text>
          <NotificationsButton audience="merchant" />
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Solid, matching the bottom nav, so the header and the tab bar frame the screen as a pair;
  // the border mirrors the nav's top border.
  headerSafe: { backgroundColor: t.bar, borderBottomWidth: 1, borderBottomColor: t.border },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { flex: 1, fontSize: 22, fontWeight: '900', color: t.text },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 2, fontWeight: '600' },
});
