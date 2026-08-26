import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from './auth';
import { useAuthPrompt } from './AuthPrompt';
import { t } from './theme';

export type TabKey = 'home' | 'explore' | 'orders' | 'account' | 'route' | 'history' | 'products';
type Variant = 'client' | 'driver' | 'merchant';

// Primary navigation, fixed to the bottom (replaces the old top-right drawer). Each role gets its
// own set of destinations; "Cuenta" is shared and adapts to who is signed in.
const TABS: Record<Variant, { key: TabKey; label: string; icon: string; route: string }[]> = {
  client: [
    { key: 'home', label: 'Inicio', icon: 'home', route: '/home' },
    // Clients only -- the driver bar below has no equivalent.
    { key: 'explore', label: 'Explorar', icon: 'compass', route: '/explore' },
    { key: 'orders', label: 'Pedidos', icon: 'receipt', route: '/orders' },
    // No Direcciones tab: the address book is reached from Cuenta > Direcciones instead, which
    // keeps the bar to the three things a customer actually moves between while ordering.
    { key: 'account', label: 'Cuenta', icon: 'user', route: '/account' },
  ],
  driver: [
    // The home is the pool map (finding the NEXT job); Mi ruta is the work already in hand.
    { key: 'home', label: 'Inicio', icon: 'home', route: '/home' },
    { key: 'route', label: 'Mi ruta', icon: 'route', route: '/route' },
    { key: 'history', label: 'Historial', icon: 'clipboard-list', route: '/history' },
    { key: 'account', label: 'Cuenta', icon: 'user', route: '/account' },
  ],
  // The merchant's counter view: the queue still to be dealt with, what they sell, the orders
  // already finished, and the shared account tab.
  merchant: [
    { key: 'home', label: 'Inicio', icon: 'home', route: '/home' },
    { key: 'products', label: 'Productos', icon: 'box', route: '/merchant-products' },
    { key: 'history', label: 'Historial', icon: 'clipboard-list', route: '/merchant-history' },
    { key: 'account', label: 'Cuenta', icon: 'user', route: '/account' },
  ],
};

// How much space a screen must leave at the bottom so content is not hidden behind the bar.
export const BOTTOM_NAV_HEIGHT = 62;

// The tabs a GUEST cannot open: both are windows into an account that does not exist. Tapping one
// asks the sign-in question in place (the AuthPrompt popup) instead of yanking the person to the
// login screen -- cancelling leaves them browsing right where they were. Only the client bar can
// meet a guest; drivers and merchants are signed in by definition.
const AUTH_ONLY_TABS: TabKey[] = ['orders', 'account'];

export function BottomNav({ active, variant = 'client' }: { active: TabKey; variant?: Variant }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { promptLogin } = useAuthPrompt();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS[variant].map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={styles.item}
            // replace, not push: tabs switch rather than stack on top of each other.
            onPress={() => {
              if (on) return;
              if (!token && AUTH_ONLY_TABS.includes(tab.key)) { promptLogin(); return; }
              router.replace(tab.route as any);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <FontAwesome5 name={tab.icon} size={18} solid color={on ? t.text : t.textFaint} />
            <Text style={[styles.label, on && styles.labelActive]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#0b2a6b',
    borderTopWidth: 1,
    borderTopColor: t.border,
    paddingTop: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 -4px 16px rgba(0,0,0,0.25)' as any } : { elevation: 12 }),
  },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: '700', color: t.textFaint },
  labelActive: { color: t.text, fontWeight: '800' },
});
