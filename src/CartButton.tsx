import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useCart } from './cart';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<
  Locale,
  {
    cartWithCount: (count: number) => string;
    cartEmpty: string;
  }
> = {
  es: {
    cartWithCount: (count) => `Carrito, ${count} artículos`,
    cartEmpty: 'Carrito vacío',
  },
  en: {
    cartWithCount: (count) => `Cart, ${count} ${count === 1 ? 'item' : 'items'}`,
    cartEmpty: 'Cart is empty',
  },
  fr: {
    cartWithCount: (count) => `Panier, ${count} ${count === 1 ? 'article' : 'articles'}`,
    cartEmpty: 'Panier vide',
  },
};

// The cart, reachable from the top of any customer screen rather than only from the bar that
// appears once something is in it: people who came back to finish an order look up here for it.
//
// One component rather than a copy per screen, for the same reason as NotificationsButton: it is
// the same disc, the same badge rule and the same destination. The badge is the whole point -- an
// empty cart shows none, so the icon stays quiet until there is something to collect.
export function CartButton({ style }: {
  /** Margin from the caller's header; everything else about the button lives here. */
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const cart = useCart();
  const tx = useStrings(S);

  return (
    <Pressable
      style={[styles.btn, style]}
      onPress={() => router.push('/cart')}
      accessibilityRole="button"
      accessibilityLabel={cart.count > 0 ? tx.cartWithCount(cart.count) : tx.cartEmpty}
    >
      <FontAwesome5 name="shopping-cart" size={14} color={t.text} />
      {cart.count > 0 ? (
        <View style={styles.badge}>
          {/* Past 99 the count stops being a number worth reading and starts breaking the circle. */}
          <Text style={styles.badgeText}>{cart.count > 99 ? '99+' : cart.count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  // Overhangs the rim, so the count never sits on top of the icon it counts.
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10,
    paddingHorizontal: 5, backgroundColor: t.accent,
    // Against the gradient the white badge and the white-ish rim would merge; the border separates
    // them the way the app's other floating chips do.
    borderWidth: 2, borderColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: t.onAccent, fontSize: 10, fontWeight: '900' },
});
