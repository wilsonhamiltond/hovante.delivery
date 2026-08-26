import React, { createContext, useContext, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { GRADIENT, t } from './theme';

// The "necesitas una cuenta" popup, asked whenever a GUEST taps something account-based (the
// Pedidos/Cuenta tabs, checkout past the cart review, saving an address). One shared modal behind
// a context rather than a per-screen dialog, so every gated tap asks the same question the same
// way -- and cancelling simply closes it, leaving the guest browsing where they were.
//
// Same backdrop/card/ring-icon language as ConfirmDialog and NoticeDialog. Two ways forward map to
// the two screens that already exist: "Iniciar sesión" opens the welcome screen (all the sign-in
// options: Google, Apple, correo), "Crear cuenta" jumps straight into the register wizard.

interface AuthPromptState {
  /** Show the popup. The guest decides there: sign in, create an account, or cancel. */
  promptLogin: () => void;
}

const AuthPromptContext = createContext<AuthPromptState | undefined>(undefined);

export function AuthPromptProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  const close = () => setVisible(false);
  const go = (path: '/login' | '/register') => {
    setVisible(false);
    router.push(path);
  };

  return (
    <AuthPromptContext.Provider value={{ promptLogin: () => setVisible(true) }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
        // Android's back button cancels, same as tapping outside.
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Swallows the press so tapping the card itself does not dismiss it. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.iconWrap}>
              <FontAwesome5 name="user" solid size={20} color={t.text} />
            </View>

            <Text style={styles.title}>Inicia sesión para continuar</Text>
            <Text style={styles.message}>
              Esta parte de la app necesita una cuenta. Entra con la tuya o crea una nueva.
            </Text>

            <Pressable
              style={styles.primary}
              onPress={() => go('/login')}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
            >
              <Text style={styles.primaryText}>Iniciar sesión</Text>
            </Pressable>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancelar">
              <Text style={styles.cancel}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </AuthPromptContext.Provider>
  );
}

export function useAuthPrompt(): AuthPromptState {
  const ctx = useContext(AuthPromptContext);
  if (!ctx) throw new Error('useAuthPrompt must be used within AuthPromptProvider');
  return ctx;
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
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: t.border,
    backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { color: t.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  message: { color: t.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  // Same primary/secondary pair as the welcome screen: solid accent to sign in, outline to start
  // a new account.
  primary: {
    alignSelf: 'stretch', marginTop: 10, backgroundColor: t.accent,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  secondary: {
    alignSelf: 'stretch', borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  secondaryText: { color: t.text, fontSize: 16, fontWeight: '800' },
  cancel: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
});
