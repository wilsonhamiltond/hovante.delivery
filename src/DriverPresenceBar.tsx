import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NO_LOCATION, useDriverPresence } from './driverPresence';
import { ConfirmDialog } from './ConfirmDialog';
import { hasBackgroundPermission } from './driverBackground';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

// The driver's online toggle, under the greeting on the home screen. Offline is the state worth
// shouting about -- a driver who thinks they are working but receives nothing is the failure this
// exists to prevent -- so it gets a full-width call to action, while online is a quiet status line.

const S: Record<
  Locale,
  {
    online: string;
    stale: string;
    offline: string;
    timedOut: string;
    goOnline: string;
    goOffline: string;
    offlineHint: string;
    foregroundOnly: string;
    openSettings: string;
    noLocation: string;
    warnTitle: string;
    warnMessage: (n: number) => string;
    warnConfirm: string;
    disclosureTitle: string;
    disclosureMessage: string;
    disclosureConfirm: string;
  }
> = {
  es: {
    online: 'En línea · recibiendo pedidos',
    stale: 'En línea · sin señal, reconectando…',
    offline: 'Desconectado',
    timedOut: 'Te desconectamos porque no recibimos tu ubicación en un rato.',
    goOnline: 'Ponerme en línea',
    goOffline: 'Desconectarme',
    offlineHint: 'No recibirás pedidos nuevos hasta que te pongas en línea.',
    foregroundOnly: 'Sin permiso de ubicación "Siempre": mantén Volao abierto para seguir en línea.',
    openSettings: 'Ajustes',
    noLocation: 'Activa tu ubicación para ponerte en línea.',
    warnTitle: 'Tienes entregas en curso',
    warnMessage: (n) =>
      `Tienes ${n} entrega(s) en curso. Si te desconectas no recibirás pedidos nuevos, pero debes completar las que ya tienes.`,
    warnConfirm: 'Desconectarme',
    disclosureTitle: 'Uso de tu ubicación',
    disclosureMessage:
      'Mientras estés en línea, Volao recopila tu ubicación incluso cuando la app está cerrada o no la estás usando, para enviarte pedidos cercanos y mostrar al comercio y al cliente dónde va su entrega. Dejamos de recopilarla cuando te desconectas.\n\nEn la siguiente pantalla elige "Permitir siempre".',
    disclosureConfirm: 'Continuar',
  },
  en: {
    online: 'Online · receiving orders',
    stale: 'Online · no signal, reconnecting…',
    offline: 'Offline',
    timedOut: 'We took you offline because we had not received your location for a while.',
    goOnline: 'Go online',
    goOffline: 'Go offline',
    offlineHint: 'You will not receive new orders until you go online.',
    foregroundOnly: 'No "Always" location permission: keep Volao open to stay online.',
    openSettings: 'Settings',
    noLocation: 'Turn on your location to go online.',
    warnTitle: 'You have deliveries in progress',
    warnMessage: (n) =>
      `You have ${n} delivery(ies) in progress. Going offline stops new orders, but you still have to complete the ones you have.`,
    warnConfirm: 'Go offline',
    disclosureTitle: 'Use of your location',
    disclosureMessage:
      'While you are online, Volao collects your location even when the app is closed or not in use, to send you nearby orders and show the merchant and customer where their delivery is. We stop collecting it when you go offline.\n\nOn the next screen choose "Allow all the time".',
    disclosureConfirm: 'Continue',
  },
  fr: {
    online: 'En ligne · réception des commandes',
    stale: 'En ligne · pas de signal, reconnexion…',
    offline: 'Hors ligne',
    timedOut: 'Nous vous avons mis hors ligne car nous n’avons pas reçu votre position depuis un moment.',
    goOnline: 'Me mettre en ligne',
    goOffline: 'Me déconnecter',
    offlineHint: 'Vous ne recevrez pas de nouvelles commandes tant que vous n’êtes pas en ligne.',
    foregroundOnly: 'Pas d’autorisation de localisation « Toujours » : gardez Volao ouvert pour rester en ligne.',
    openSettings: 'Réglages',
    noLocation: 'Activez votre localisation pour vous mettre en ligne.',
    warnTitle: 'Vous avez des livraisons en cours',
    warnMessage: (n) =>
      `Vous avez ${n} livraison(s) en cours. Hors ligne, vous ne recevrez plus de commandes, mais vous devez terminer celles que vous avez.`,
    warnConfirm: 'Me déconnecter',
    disclosureTitle: 'Utilisation de votre position',
    disclosureMessage:
      'Tant que vous êtes en ligne, Volao collecte votre position même lorsque l’application est fermée ou non utilisée, pour vous envoyer des commandes proches et montrer au commerce et au client où en est leur livraison. Nous arrêtons de la collecter quand vous vous déconnectez.\n\nSur l’écran suivant, choisissez « Toujours autoriser ».',
    disclosureConfirm: 'Continuer',
  },
};

/** `activeDeliveries` is the screen's own count, fresher than the presence's after a claim. */
export function DriverPresenceBar({ activeDeliveries }: { activeDeliveries: number }) {
  const tx = useStrings(S);
  const { presence, online, stale, mode, busy, goOnline, goOffline } = useDriverPresence();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [disclosing, setDisclosing] = useState(false);

  // Not loaded yet: render nothing rather than flash "Desconectado" at a driver who is online.
  if (!presence) return null;

  const carrying = Math.max(activeDeliveries, presence.activeDeliveries);

  // Google Play requires a prominent in-app disclosure right before the background-location
  // permission prompt, accepted by an explicit tap. Shown only while that permission is missing.
  const onOnPress = async () => {
    setError(null);
    if (await hasBackgroundPermission()) void turnOn();
    else setDisclosing(true);
  };

  const turnOn = async () => {
    setDisclosing(false);
    setError(null);
    const err = await goOnline();
    if (err) setError(err === NO_LOCATION ? tx.noLocation : err);
  };

  const turnOff = async () => {
    setConfirming(false);
    setError(null);
    const err = await goOffline();
    if (err) setError(err);
  };

  // Going offline mid-delivery is allowed -- the driver may be ending their day after this last
  // drop -- but never by accident.
  const onOffPress = () => (carrying > 0 ? setConfirming(true) : void turnOff());

  return (
    <View style={styles.wrap}>
      {online ? (
        <View style={styles.row}>
          <View style={[styles.dot, stale ? styles.dotStale : styles.dotOn]} />
          <Text style={styles.status} numberOfLines={1}>{stale ? tx.stale : tx.online}</Text>
          <Pressable
            style={styles.offBtn}
            onPress={onOffPress}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color={t.text} /> : <Text style={styles.offText}>{tx.goOffline}</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.offlineCard}>
          <View style={styles.row}>
            <View style={[styles.dot, styles.dotOff]} />
            <Text style={styles.status}>{tx.offline}</Text>
          </View>
          <Text style={styles.hint}>
            {presence.offlineReason === 'TIMEOUT' ? tx.timedOut : tx.offlineHint}
          </Text>
          <Pressable
            style={[styles.onBtn, busy && styles.disabled]}
            onPress={onOnPress}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.onText}>{tx.goOnline}</Text>}
          </Pressable>
        </View>
      )}

      {online && mode === 'foreground-only' && Platform.OS !== 'web' ? (
        <View style={styles.row}>
          <Text style={[styles.hint, { flex: 1 }]}>{tx.foregroundOnly}</Text>
          <Pressable onPress={() => Linking.openSettings()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>{tx.openSettings}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ConfirmDialog
        visible={confirming}
        title={tx.warnTitle}
        message={tx.warnMessage(carrying)}
        confirmLabel={tx.warnConfirm}
        onConfirm={turnOff}
        onCancel={() => setConfirming(false)}
      />
      <ConfirmDialog
        visible={disclosing}
        title={tx.disclosureTitle}
        message={tx.disclosureMessage}
        confirmLabel={tx.disclosureConfirm}
        onConfirm={turnOn}
        onCancel={() => setDisclosing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#22c55e' },
  dotStale: { backgroundColor: '#f59e0b' },
  dotOff: { backgroundColor: '#94a3b8' },
  status: { flex: 1, fontSize: 13, fontWeight: '800', color: t.text },
  offBtn: {
    borderWidth: 1, borderColor: t.border, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5, minWidth: 90, alignItems: 'center',
  },
  offText: { color: t.textMuted, fontSize: 12, fontWeight: '800' },
  offlineCard: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    padding: 12, gap: 8,
  },
  hint: { fontSize: 12, fontWeight: '600', color: t.textMuted },
  onBtn: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  onText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.7 },
  link: { color: t.text, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  error: { fontSize: 12, fontWeight: '700', color: t.danger },
});
