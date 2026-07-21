import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { t } from './theme';

export type TabKey = 'home' | 'orders' | 'addresses' | 'account' | 'pickup' | 'history';
type Variant = 'client' | 'driver';

// Primary navigation, fixed to the bottom (replaces the old top-right drawer). Each role gets its
// own set of destinations; "Cuenta" is shared and adapts to who is signed in.
const TABS: Record<Variant, { key: TabKey; label: string; icon: string; route: string }[]> = {
  client: [
    { key: 'home', label: 'Inicio', icon: 'home', route: '/home' },
    { key: 'orders', label: 'Pedidos', icon: 'receipt', route: '/orders' },
    { key: 'addresses', label: 'Direcciones', icon: 'map-marker-alt', route: '/addresses' },
    { key: 'account', label: 'Cuenta', icon: 'user', route: '/account' },
  ],
  driver: [
    { key: 'home', label: 'Mi ruta', icon: 'route', route: '/home' },
    { key: 'pickup', label: 'Disponibles', icon: 'box-open', route: '/pickup' },
    { key: 'history', label: 'Historial', icon: 'clipboard-list', route: '/history' },
    { key: 'account', label: 'Cuenta', icon: 'user', route: '/account' },
  ],
};

// How much space a screen must leave at the bottom so content is not hidden behind the bar.
export const BOTTOM_NAV_HEIGHT = 62;

export function BottomNav({ active, variant = 'client' }: { active: TabKey; variant?: Variant }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS[variant].map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={styles.item}
            // replace, not push: tabs switch rather than stack on top of each other.
            onPress={() => { if (!on) router.replace(tab.route as any); }}
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
