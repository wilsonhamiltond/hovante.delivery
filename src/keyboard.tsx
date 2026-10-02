import type { ComponentProps } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import {
  KeyboardAvoidingView as KCKeyboardAvoidingView,
  KeyboardAwareScrollView as KCKeyboardAwareScrollView,
} from 'react-native-keyboard-controller';

export { KeyboardProvider } from 'react-native-keyboard-controller';

// bottomOffset for a form with a Save button pinned below it: the focused field has to clear the
// button as well as the keyboard, since the button rides up on top of the keyboard.
export const FOOTER_OFFSET = 104;

// Keeps whatever field has focus above the keyboard, on both platforms. React Native's own
// helpers fall short since SDK 54 made Android edge-to-edge: the window no longer shrinks for the
// keyboard there, so a field low on the screen simply ends up underneath it.
//
// For screens whose fields live in a scroll view: scrolls the focused field into view, leaving
// bottomOffset of room between it and the keyboard (enough for a hint or the button below it).
export function KeyboardAwareScrollView(props: ComponentProps<typeof KCKeyboardAwareScrollView>) {
  return <KCKeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" {...props} />;
}

// For screens laid out without a scroll view (a map above a field, a centred form, a bottom
// sheet): lifts the whole block by however much of it the keyboard covers. It always fills its
// parent; `style` goes on an inner view because the keyboard padding replaces the outer view's
// paddingBottom, and would otherwise wipe out the screen's own padding even with no keyboard up.
export function KeyboardAvoidingView({ style, children, ...props }: ViewProps & { keyboardVerticalOffset?: number; enabled?: boolean }) {
  return (
    <KCKeyboardAvoidingView behavior="padding" style={styles.fill} {...props}>
      <View style={[styles.fill, style]}>{children}</View>
    </KCKeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
