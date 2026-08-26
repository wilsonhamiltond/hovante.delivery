import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { t } from './theme';

// A pulsing placeholder block, drawn where content is about to appear. Rails compose these into
// stand-ins matching their real cards' dimensions, so the layout does not jump when data lands.
//
// Opacity pulse rather than a shimmer sweep: a sweep needs a gradient mask (or a library), and on
// the glassy cards this app draws over its gradient, a soft pulse reads just as clearly.
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // The native driver cannot run on react-native-web; everywhere else it keeps the pulse off
    // the JS thread, so a busy first render does not freeze the placeholders mid-breath.
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return <Animated.View style={[styles.base, style, { opacity: pulse }]} />;
}

const styles = StyleSheet.create({
  base: { backgroundColor: t.cardStrong, borderRadius: 8 },
});
