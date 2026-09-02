import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { close: string }> = {
  es: { close: 'Cerrar teclado' },
  en: { close: 'Close keyboard' },
  fr: { close: 'Fermer le clavier' },
};

// A small "close the keyboard" pill for fields whose keyboards have no key of their own to leave
// with: multiline boxes (Enter types a newline) and the iOS numeric pads (no return key at all).
// Render it beside the field's label, gated on the field's focus. onPressIn rather than onPress:
// on web, pressing it blurs the field first, and the re-render that hides the pill would swallow
// a click that only lands on release.
export function KeyboardCloseButton({ visible }: { visible: boolean }) {
  const tx = useStrings(S);
  if (!visible) return null;
  return (
    <Pressable
      style={styles.btn}
      onPressIn={() => Keyboard.dismiss()}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={tx.close}
    >
      <Text style={styles.text}>✕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999,
    width: 26, height: 26, alignItems: 'center', justifyContent: 'center',
  },
  text: { color: t.text, fontSize: 13, fontWeight: '800', lineHeight: 15 },
});
