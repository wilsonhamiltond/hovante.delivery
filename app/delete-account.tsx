import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { ConfirmDialog } from '../src/ConfirmDialog';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    deleted: string;
    title: string;
    lead: string;
    itemPersonal: string;
    itemAddresses: string;
    itemPhoto: string;
    itemAccess: string;
    noteOrders: string;
    noteIrreversible: string;
    deleteMyAccount: string;
    confirmTitle: string;
    confirmMessage: string;
    confirmLabel: string;
  }
> = {
  es: {
    deleted: 'Tu cuenta fue eliminada.',
    title: 'Eliminar cuenta',
    lead: 'Al eliminar tu cuenta se borran de forma permanente:',
    itemPersonal: '• Tus datos personales (nombre, teléfono, correo)',
    itemAddresses: '• Tus direcciones guardadas',
    itemPhoto: '• Tu foto de perfil',
    itemAccess: '• El acceso a la aplicación con esta cuenta',
    noteOrders: 'Los pedidos y las facturas ya emitidas se conservan de forma anónima porque forman parte del registro de ventas y fiscal de los comercios, pero dejan de estar vinculados a ti: se les retiran tu nombre, teléfono y dirección.',
    noteIrreversible: 'Esta acción no se puede deshacer. Si solo quieres salir de la aplicación, usa «Cerrar sesión» en Mi cuenta.',
    deleteMyAccount: 'Eliminar mi cuenta',
    confirmTitle: 'Eliminar cuenta',
    confirmMessage: '¿Seguro que quieres eliminar tu cuenta? Esta acción no se puede deshacer.',
    confirmLabel: 'Sí, eliminar mi cuenta',
  },
  en: {
    deleted: 'Your account was deleted.',
    title: 'Delete account',
    lead: 'Deleting your account permanently erases:',
    itemPersonal: '• Your personal details (name, phone, email)',
    itemAddresses: '• Your saved addresses',
    itemPhoto: '• Your profile picture',
    itemAccess: '• Access to the app with this account',
    noteOrders: 'Orders and invoices already issued are kept anonymously because they are part of the merchants’ sales and tax records, but they are no longer linked to you: your name, phone, and address are removed from them.',
    noteIrreversible: 'This action cannot be undone. If you just want to leave the app, use "Sign out" in My account.',
    deleteMyAccount: 'Delete my account',
    confirmTitle: 'Delete account',
    confirmMessage: 'Are you sure you want to delete your account? This action cannot be undone.',
    confirmLabel: 'Yes, delete my account',
  },
  fr: {
    deleted: 'Votre compte a été supprimé.',
    title: 'Supprimer le compte',
    lead: 'La suppression de votre compte efface de façon permanente :',
    itemPersonal: '• Vos données personnelles (nom, téléphone, e-mail)',
    itemAddresses: '• Vos adresses enregistrées',
    itemPhoto: '• Votre photo de profil',
    itemAccess: '• L’accès à l’application avec ce compte',
    noteOrders: 'Les commandes et les factures déjà émises sont conservées de façon anonyme car elles font partie des registres de ventes et fiscaux des commerces, mais elles ne sont plus liées à vous : votre nom, votre téléphone et votre adresse en sont retirés.',
    noteIrreversible: 'Cette action est irréversible. Si vous souhaitez simplement quitter l’application, utilisez « Se déconnecter » dans Mon compte.',
    deleteMyAccount: 'Supprimer mon compte',
    confirmTitle: 'Supprimer le compte',
    confirmMessage: 'Voulez-vous vraiment supprimer votre compte ? Cette action est irréversible.',
    confirmLabel: 'Oui, supprimer mon compte',
  },
};

// Delete the signed-in account, reached from "Mi cuenta" (App Store 5.1.1(v): an account created
// in the app must be deletable in the app).
//
// The screen says exactly what goes and what stays before anything is tapped, and the button still
// asks once more: unlike signing out there is no way back from this. The ask is the in-app
// ConfirmDialog rather than Alert.alert, which renders nothing on web -- this confirmation must
// exist on every platform the button does.
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const tx = useStrings(S);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  const remove = async () => {
    setConfirming(false);
    setSubmitting(true);
    const res = await api.deleteAccount();
    setSubmitting(false);

    if (!res.success) {
      // A refusal ("tienes un pedido en curso") names what to resolve first; the account stays.
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    setNotice({ tone: 'success', message: tx.deleted });
  };

  // Dismissing the success notice ends the session: the account behind it no longer exists, and
  // signing out is what routes back to the welcome screen.
  const dismiss = async () => {
    const wasSuccess = notice?.tone === 'success';
    setNotice(null);
    if (wasSuccess) await signOut();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={styles.title}>{tx.title}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.warnIcon}>
            <FontAwesome5 name="user-slash" size={26} solid color={t.danger} />
          </View>

          <Text style={styles.lead}>
            {tx.lead}
          </Text>
          <View style={styles.card}>
            <Text style={styles.item}>{tx.itemPersonal}</Text>
            <Text style={styles.item}>{tx.itemAddresses}</Text>
            <Text style={styles.item}>{tx.itemPhoto}</Text>
            <Text style={styles.item}>{tx.itemAccess}</Text>
          </View>

          <Text style={styles.note}>
            {tx.noteOrders}
          </Text>
          <Text style={styles.note}>
            {tx.noteIrreversible}
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={[styles.danger, submitting && styles.disabled]} onPress={() => setConfirming(true)} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color={t.onAccent} />
              : <Text style={styles.dangerText}>{tx.deleteMyAccount}</Text>}
          </Pressable>
        </View>

        <ConfirmDialog
          visible={confirming}
          title={tx.confirmTitle}
          message={tx.confirmMessage}
          confirmLabel={tx.confirmLabel}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
        <NoticeDialog notice={notice} onClose={dismiss} />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  warnIcon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: t.card, borderWidth: 1, borderColor: t.danger, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  lead: { color: t.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, gap: 8 },
  item: { color: t.text, fontSize: 14, lineHeight: 20 },
  note: { color: t.textMuted, fontSize: 13, lineHeight: 19, marginTop: 14 },
  footer: { paddingHorizontal: 16, paddingBottom: 8 },
  // The solid red fill the app reserves for confirming a destructive action, which is exactly what
  // this button is.
  danger: { backgroundColor: t.danger, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: t.onAccent, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
