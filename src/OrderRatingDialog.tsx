import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { OrderRatingCard, type RatingRole } from './OrderRatingCard';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { title: string; done: string }> = {
  es: { title: '¿Cómo te fue? ⭐', done: 'Listo' },
  en: { title: 'How did it go? ⭐', done: 'Done' },
  fr: { title: 'Comment ça s’est passé ? ⭐', done: 'Terminé' },
};

// The rating card as a bottom-sheet popup, shown the moment a handover completes: the driver just
// confirmed the delivery, or the counter just handed a pickup order over. Same stars-and-comment
// card the order screens embed -- this is only a stage for it, so rating right then is one tap
// instead of a scroll hunt. Dismissable at will: the card stays available on the order screen,
// and the "califica" push brings anyone back to it.
export function OrderRatingDialog({ visible, orderId, targets, onClose }: {
  visible: boolean;
  orderId: string;
  targets: { role: RatingRole; name?: string | null }[];
  onClose: () => void;
}) {
  const tx = useStrings(S);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{tx.title}</Text>
          <OrderRatingCard orderId={orderId} targets={targets} style={styles.flatCard} hideTitle />
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.done}>{tx.done}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 4 },
  // The sheet is already the surface; the embedded card sheds its own card chrome.
  flatCard: { backgroundColor: 'transparent', borderWidth: 0, padding: 0 },
  done: { color: t.textMuted, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
});
