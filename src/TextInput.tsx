import { useId, type Ref } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputProps,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { done: string; close: string }> = {
  es: { done: 'Listo', close: 'Cerrar teclado' },
  en: { done: 'Done', close: 'Close keyboard' },
  fr: { done: 'OK', close: 'Fermer le clavier' },
};

// The instance type, so refs keep reading `useRef<TextInput>(null)`.
export type TextInput = RNTextInput;

// iOS keyboards that have no return key at all.
const NUMBER_PADS = new Set(['number-pad', 'phone-pad', 'decimal-pad', 'numeric', 'ascii-capable-number-pad']);

// The app's TextInput: React Native's, plus a way off every iOS keyboard. Single-line fields
// already leave with their return key; the ones that cannot are the number pads (no return key)
// and multiline boxes (return types a newline). Both get the app's own "Listo" bar docked on top
// of the keyboard -- the white pill of a primary button, floating with no bar behind it.
// Each field owns its own bar: on the new architecture an InputAccessoryView attaches to the one
// field it finds when it mounts, so a shared bar would only ever serve the first field.
// Android keyboards close themselves (hide key, back button), so it is plain TextInput there.
export function TextInput({ ref, ...props }: TextInputProps & { ref?: Ref<RNTextInput> }) {
  const tx = useStrings(S);
  const barId = `kb-${useId()}`;
  if (Platform.OS !== 'ios' || props.inputAccessoryViewID) return <RNTextInput ref={ref} {...props} />;

  const numberPad = !!props.keyboardType && NUMBER_PADS.has(props.keyboardType);
  // Multiline boxes set to leave on return already have their way out.
  const closesOnReturn = props.submitBehavior?.startsWith('blur') || props.blurOnSubmit === true;
  if (!numberPad && (!props.multiline || closesOnReturn)) return <RNTextInput ref={ref} {...props} />;

  // A number pad's "Listo" stands in for the return key it lacks, so it submits the field the way
  // return would (the delivery code, the vehicle form); a multiline box's only closes the keyboard.
  const done = () => {
    if (numberPad) {
      props.onSubmitEditing?.({ nativeEvent: { text: String(props.value ?? '') } } as NativeSyntheticEvent<TextInputSubmitEditingEventData>);
    }
    Keyboard.dismiss();
  };

  return (
    <>
      <RNTextInput ref={ref} {...props} inputAccessoryViewID={barId} />
      {/* After the field: the bar looks for its field when it mounts. Absolutely positioned and
          hidden in place, so it never takes up room beside the field. */}
      <InputAccessoryView nativeID={barId} backgroundColor="transparent">
        <View style={styles.bar}>
          <Pressable
            onPress={done}
            hitSlop={8}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            accessibilityRole="button"
            accessibilityLabel={tx.close}
          >
            <Text style={styles.pillCheck}>✓</Text>
            <Text style={styles.pillText}>{tx.done}</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </>
  );
}

const styles = StyleSheet.create({
  // No strip of its own: the pill floats over the screen just above the keyboard.
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  pillPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  pillCheck: { color: t.onAccent, fontSize: 15, fontWeight: '900' },
  pillText: { color: t.onAccent, fontSize: 15, fontWeight: '800' },
});
