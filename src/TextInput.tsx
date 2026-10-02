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
  type TextInputProps,
} from 'react-native';
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
// and multiline boxes (return types a newline). Number pads get the native toolbar React Native
// draws when given a button label; multiline boxes get a "Done" bar docked on the keyboard.
// Each box owns its own bar: on the new architecture an InputAccessoryView attaches to the one
// field it finds when it mounts, so a shared bar would only ever serve the first field.
// Android keyboards close themselves (hide key, back button), so it is plain TextInput there.
export function TextInput({ ref, ...props }: TextInputProps & { ref?: Ref<RNTextInput> }) {
  const tx = useStrings(S);
  const barId = `kb-${useId()}`;
  if (Platform.OS !== 'ios') return <RNTextInput ref={ref} {...props} />;

  if (props.keyboardType && NUMBER_PADS.has(props.keyboardType)) {
    return <RNTextInput ref={ref} inputAccessoryViewButtonLabel={tx.done} {...props} />;
  }

  // Multiline boxes set to leave on return already have their way out.
  const closesOnReturn = props.submitBehavior?.startsWith('blur') || props.blurOnSubmit === true;
  if (!props.multiline || closesOnReturn || props.inputAccessoryViewID) {
    return <RNTextInput ref={ref} {...props} />;
  }

  return (
    <>
      <RNTextInput ref={ref} {...props} inputAccessoryViewID={barId} />
      {/* After the field: the bar looks for its field when it mounts. Absolutely positioned and
          hidden in place, so it never takes up room beside the field. */}
      <InputAccessoryView nativeID={barId}>
        <View style={styles.bar}>
          <Pressable
            onPress={() => Keyboard.dismiss()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tx.close}
          >
            <Text style={styles.barText}>{tx.done}</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </>
  );
}

const styles = StyleSheet.create({
  // Matches the light iOS keyboard so the bar reads as part of it.
  bar: {
    flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: '#F1F1F3',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C7C7CC',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  barText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
});
