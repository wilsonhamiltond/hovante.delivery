import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { t } from './theme';

// Every header balances its centred title against a spacer of the same width on the other side, so
// the button has a fixed one and screens use this for that spacer instead of a magic number.
export const BACK_BUTTON_WIDTH = 104;

interface Props {
  onPress: () => void;
  /** Where it goes back to, when that is worth naming ("Pedidos"). Defaults to "Atrás". */
  label?: string;
}

// The back control, shaped like the home screen's address pill: a translucent rounded chip with the
// chevron in its own disc. Previously this was bare "‹ Atrás" text, which read as a caption rather
// than something tappable -- the same problem the address dropdown had.
export function BackButton({ onPress, label = 'Atrás' }: Props) {
  return (
    <Pressable
      style={styles.pill}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.iconWrap}>
        <FontAwesome5 name="chevron-left" size={10} color={t.text} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: BACK_BUTTON_WIDTH,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 999,
    paddingLeft: 5, paddingRight: 12, paddingVertical: 5,
  },
  iconWrap: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: t.cardStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  // Shrinks rather than pushing the disc out of the pill if a label ever runs long.
  label: { flexShrink: 1, color: t.text, fontSize: 14, fontWeight: '800' },
});
