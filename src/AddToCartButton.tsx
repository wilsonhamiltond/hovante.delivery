import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { addedToCart: string }> = {
  es: { addedToCart: 'Agregado al carrito' },
  en: { addedToCart: 'Added to cart' },
};

/** How long the tick stays before the button turns back into "add". */
export const ADDED_FEEDBACK_MS = 5000;

interface Props {
  /** True while this product's tick is showing. The parent owns the timer, not this button. */
  added: boolean;
  onPress: () => void;
  /** Accessibility label for the idle state ("Agregar <product>"). */
  label: string;
}

// The round add-to-cart button on a product tile. Tapping it swaps the cart icon for a tick, which
// pops in and sits there for ADDED_FEEDBACK_MS before swapping back -- confirmation that the tap
// landed, without a toast covering the grid or a count the tile has no room for.
//
// Whether the tick is showing is the parent's state, keyed by product id: a FlatList recycles these
// rows, so a tick owned in here would follow the recycled view onto a different product.
export function AddToCartButton({ added, onPress, label }: Props) {
  const tx = useStrings(S);
  // One value drives everything: 0 is the cart, 1 is the tick.
  const swap = useRef(new Animated.Value(added ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(swap, {
      toValue: added ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();
  }, [added, swap]);

  // Overshoot at the halfway point, so the swap reads as a pop rather than a dissolve.
  const pop = swap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.18, 1] });

  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={added ? tx.addedToCart : label}
    >
      <Animated.View style={[styles.stack, { transform: [{ scale: pop }] }]}>
        {/* Both icons are stacked absolutely rather than swapped in flow: the two glyphs are
            different widths, and laying them out normally made the button jump as they changed. */}
        <Animated.View
          style={[styles.icon, {
            opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ scale: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) }],
          }]}
        >
          <FontAwesome5 name="cart-plus" size={14} color={t.onAccent} />
        </Animated.View>
        <Animated.View
          style={[styles.icon, {
            opacity: swap,
            transform: [{ scale: swap.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }]}
        >
          <FontAwesome5 name="check" size={14} color={t.onSuccess} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 30, height: 30, borderRadius: 15, backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' },
  stack: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  icon: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
});
