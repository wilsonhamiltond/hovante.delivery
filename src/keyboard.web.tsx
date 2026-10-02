import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native';

// bottomOffset for a form with a Save button pinned below it: the focused field has to clear the
// button as well as the keyboard, since the button rides up on top of the keyboard.
export const FOOTER_OFFSET = 104;

// The web build has no on-screen keyboard to dodge (a phone browser scrolls the field into view
// itself), so these are plain stand-ins with the same props as the native versions.
export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function KeyboardAwareScrollView({ bottomOffset: _b, ...props }: ScrollViewProps & { bottomOffset?: number }) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}

export function KeyboardAvoidingView({ behavior: _b, keyboardVerticalOffset: _o, contentContainerStyle: _c, ...props }:
  ViewProps & { behavior?: string; keyboardVerticalOffset?: number; contentContainerStyle?: unknown }) {
  return <View {...props} />;
}
