import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { GRADIENT, t } from './theme';
import { useStrings, type Locale } from './i18n';

export type NoticeTone = 'error' | 'success';

export interface Notice {
  tone: NoticeTone;
  message: string;
}

interface Props {
  notice: Notice | null;
  onClose: () => void;
}

// The tone decides everything that differs: a validation problem is a red circle and "Revisa los
// datos", a confirmation is a green tick. Titles rather than raw messages as headings, because the
// messages are sentences ("Ingresa tu teléfono.") and read badly as a title.
const TONES = {
  error: { icon: 'exclamation', color: t.danger },
  success: { icon: 'check', color: t.success },
} as const;

const S: Record<Locale, { errorTitle: string; successTitle: string; ok: string }> = {
  es: { errorTitle: 'Revisa los datos', successTitle: 'Listo', ok: 'Entendido' },
  en: { errorTitle: 'Check your details', successTitle: 'Done', ok: 'Got it' },
  fr: { errorTitle: 'Vérifiez vos informations', successTitle: 'Terminé', ok: 'Compris' },
};

// A themed replacement for the line of red text under the form. Used by the sign-up wizard so every
// message -- the field validations and whatever the API answers -- lands somewhere the person
// actually looks, instead of below the button they just pressed.
export function NoticeDialog({ notice, onClose }: Props) {
  const tx = useStrings(S);
  const kind = notice?.tone ?? 'error';
  const tone = TONES[kind];
  const title = kind === 'success' ? tx.successTitle : tx.errorTitle;

  return (
    <Modal
      visible={!!notice}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Android's back button closes it, same as tapping outside.
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows the press so tapping the card itself does not dismiss it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={[styles.iconWrap, { borderColor: tone.color }]}>
            <FontAwesome5 name={tone.icon} size={22} color={tone.color} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{notice?.message}</Text>

          <Pressable
            style={styles.button}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tx.ok}
          >
            <Text style={styles.buttonText}>{tx.ok}</Text>
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
  // A ring rather than a filled disc: a solid block of red at this size shouts, and these are
  // mostly "you left a field empty", not failures.
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2,
    backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { color: t.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  message: { color: t.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  button: {
    alignSelf: 'stretch', marginTop: 10, backgroundColor: t.accent,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
});
