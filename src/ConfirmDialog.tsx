import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { GRADIENT, t } from './theme';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  // What the destructive button says ("Eliminar", "Cancelar pedido"). Never a bare "Sí": the
  // button restates the action so a hurried tap still reads what it is about to do.
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// NoticeDialog's destructive sibling: the same card, but asking rather than telling, so it carries
// two buttons where NoticeDialog has one. Exists because React Native's Alert.alert renders
// nothing on web -- a confirmation the platform can silently drop is not a confirmation.
//
// The safe exit is everywhere: the backdrop, Android's back button, and the outlined "Cancelar"
// all decline. Only the one solid red button confirms.
export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallows the press so tapping the card itself does not dismiss it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <FontAwesome5 name="exclamation-triangle" size={20} color={t.danger} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <Pressable
            style={styles.confirm}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </Pressable>
          <Pressable
            style={styles.cancel}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(3,12,34,0.62)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  card: {
    width: '100%', maxWidth: 360, alignItems: 'center',
    backgroundColor: GRADIENT[0], borderRadius: 20, borderWidth: 1, borderColor: t.border,
    paddingHorizontal: 24, paddingTop: 26, paddingBottom: 20, gap: 10,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: t.danger,
    backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { color: t.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  message: { color: t.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  // The solid red fill the app reserves for confirming a destructive action.
  confirm: {
    alignSelf: 'stretch', marginTop: 10, backgroundColor: t.danger,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  confirmText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  cancel: {
    alignSelf: 'stretch', backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  cancelText: { color: t.text, fontSize: 16, fontWeight: '800' },
});
