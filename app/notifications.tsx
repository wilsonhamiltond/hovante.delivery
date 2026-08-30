import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import * as api from '../src/api';
import { audienceOf, useNotices, type Audience, type Notice } from '../src/notifications';
import { GradientBackground, t } from '../src/theme';
import { strings, useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    now: string;
    minsAgo: (mins: number) => string;
    hoursAgo: (hours: number) => string;
    dateLocale: string;
    title: string;
    clearAllLabel: string;
    clear: string;
    empty: string;
    emptyHintDriver: string;
    emptyHintMerchant: string;
    emptyHintClient: string;
  }
> = {
  es: {
    now: 'ahora',
    minsAgo: (mins) => `hace ${mins} min`,
    hoursAgo: (hours) => `hace ${hours} h`,
    dateLocale: 'es-DO',
    title: 'Notificaciones',
    clearAllLabel: 'Limpiar todas las notificaciones',
    clear: 'Limpiar',
    empty: 'No tienes notificaciones.',
    emptyHintDriver: 'Aquí verás el estado de tus entregas: cuando tomes una, cuando salgas con ella y cuando la completes.',
    emptyHintMerchant: 'Aquí verás los pedidos que entran y cómo avanzan: confirmados, recogidos y entregados.',
    emptyHintClient: 'Aquí verás el estado de tus pedidos: cuando el comercio lo confirme, cuando un repartidor lo tome y cuando llegue a tu puerta.',
  },
  en: {
    now: 'now',
    minsAgo: (mins) => `${mins} min ago`,
    hoursAgo: (hours) => `${hours} h ago`,
    dateLocale: 'en-US',
    title: 'Notifications',
    clearAllLabel: 'Clear all notifications',
    clear: 'Clear',
    empty: 'You have no notifications.',
    emptyHintDriver: "Here you'll see the status of your deliveries: when you take one, when you head out with it, and when you complete it.",
    emptyHintMerchant: "Here you'll see incoming orders and how they progress: confirmed, picked up, and delivered.",
    emptyHintClient: "Here you'll see the status of your orders: when the store confirms it, when a driver takes it, and when it reaches your door.",
  },
};

// "Hace 5 min" / "hace 2 h" / a date once it stops being today's news.
function ago(iso: string): string {
  const tx = strings(S);
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return tx.now;
  if (mins < 60) return tx.minsAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tx.hoursAgo(hours);
  return new Date(iso).toLocaleDateString(tx.dateLocale, { day: '2-digit', month: 'short' });
}

// One inbox, three readings. A customer is told what their orders are doing, a driver what their
// deliveries are doing, a merchant what is landing on their counter -- so the role is settled first
// and the hook is left waiting until it is. Tapping an entry opens what it is about, which is the
// only thing anyone wants from a notification.
export default function NotificationsScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  // Read here rather than passed in a route param: a notification tapped from the OS lands on this
  // screen directly, with no header to have set one.
  const [audience, setAudience] = useState<Audience | null>(null);
  useEffect(() => {
    let alive = true;
    api.me().then((res) => {
      if (alive) setAudience(audienceOf(res.success ? res.data : null));
    });
    return () => { alive = false; };
  }, []);

  const { list, read, loading, markAllRead, dismiss, dismissAll } = useNotices(audience);
  const seen = new Set(read);

  // Opening the screen IS reading them: marked once the list has arrived, so the badge clears
  // behind the customer rather than making them press a second button to say "yes, I read it".
  useFocusEffect(useCallback(() => {
    if (!loading && list.length) void markAllRead();
  }, [loading, list.length, markAllRead]));

  const render = (n: Notice) => {
    const unread = !seen.has(n.id);
    return (
      <Pressable
        style={[styles.card, unread && styles.cardUnread]}
        // Each audience opens ITS OWN view of the order: the driver their stop, the merchant the
        // counter's screen, the customer the tracking timeline. The merchant case matters most --
        // /order/{id} only loads the customer's own orders, so sending a merchant there ended in
        // "pedido no encontrado".
        //
        // Opening a notice also clears it: once they are looking at the order, the inbox entry has
        // done its job. The order's NEXT state change makes a fresh entry (new id), so this never
        // silences future news.
        onPress={() => {
          void dismiss(n.id);
          router.push(
            audience === 'driver' ? `/delivery/${n.orderId}`
              : audience === 'merchant' ? `/merchant-order/${n.orderId}`
              : `/order/${n.orderId}`,
          );
        }}
        accessibilityRole="button"
      >
        {/* The dot the eye lands on: colour says which state, presence says "this is new". */}
        <View style={[styles.dot, { backgroundColor: n.color }, !unread && styles.dotRead]} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
          <Text style={styles.text} numberOfLines={2}>{n.body}</Text>
        </View>
        <Text style={styles.when}>{ago(n.at)}</Text>
      </Pressable>
    );
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          <Text style={styles.heading}>{tx.title}</Text>
          {/* Kept the back button's width when empty so the heading stays centred either way. */}
          {list.length > 0 ? (
            <Pressable
              onPress={() => void dismissAll()}
              accessibilityRole="button"
              accessibilityLabel={tx.clearAllLabel}
              hitSlop={8}
            >
              <Text style={styles.clearAll}>{tx.clear}</Text>
            </Pressable>
          ) : (
            <View style={{ width: BACK_BUTTON_WIDTH }} />
          )}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        ) : list.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>{tx.empty}</Text>
            <Text style={styles.emptyHint}>
              {audience === 'driver'
                ? tx.emptyHintDriver
                : audience === 'merchant'
                  ? tx.emptyHintMerchant
                  : tx.emptyHintClient}
            </Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => render(item)}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  heading: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  clearAll: { color: t.textMuted, fontSize: 13, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  empty: { color: t.text, fontSize: 16, fontWeight: '800' },
  emptyHint: { color: t.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 14,
  },
  // Unread stands out by weight rather than by colour, so the state dot keeps that job to itself.
  cardUnread: { backgroundColor: t.cardStrong },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotRead: { opacity: 0.45 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '800', color: t.text },
  text: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
  when: { fontSize: 11, color: t.textFaint, fontWeight: '700' },
});
