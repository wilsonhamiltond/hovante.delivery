import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { GRADIENT, t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { cancel: string }> = {
  es: { cancel: 'Cancelar' },
  en: { cancel: 'Cancel' },
  fr: { cancel: 'Annuler' },
};

interface Props {
  visible: boolean;
  /** Short heading, e.g. "Eliminar dirección". */
  title: string;
  /** The question, naming what is about to be destroyed. */
  message: string;
  /** Label of the destructive button, e.g. "Sí, eliminar". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// A themed "¿seguro?" popup for destructive actions, modeled on NoticeDialog -- same backdrop,
// card and ring icon, but with two buttons. Exists because RN's Alert cannot do this on web (its
// buttons never render there), and the red confirm keeps the convention that solid red is the
// press that actually destroys.
export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const tx = useStrings(S);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      // Android's back button cancels, same as tapping outside.
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallows the press so tapping the card itself does not dismiss it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <FontAwesome5 name="trash" size={20} color={t.danger} />
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
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={tx.cancel}>
            <Text style={styles.cancel}>{tx.cancel}</Text>
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
  // Solid red: the convention everywhere else (rechazar, cancelar pedido) for the press that
  // actually destroys.
  confirm: {
    alignSelf: 'stretch', marginTop: 10, backgroundColor: '#dc2626',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancel: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
});
