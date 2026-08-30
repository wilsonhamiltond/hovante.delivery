import { StyleSheet, Text, View } from 'react-native';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { title: string; body: string }> = {
  es: {
    title: 'El mapa no pudo cargarse',
    body: 'Google rechazó la clave de este build. Revisa, en Google Cloud Console: que la clave no'
      + ' tenga restricción de aplicación (o que incluya volao.com.do), que estén habilitadas las'
      + ' APIs Maps JavaScript y Geocoding, y que el proyecto tenga facturación activa.',
  },
  en: {
    title: 'The map could not be loaded',
    body: "Google rejected this build's key. In Google Cloud Console, check that the key has no"
      + ' application restriction (or that it includes volao.com.do), that the Maps JavaScript and'
      + ' Geocoding APIs are enabled, and that the project has billing active.',
  },
};

// What a map shows when Google refuses the key (gm_authFailure). Google's own answer is a grey box
// telling you to "see the JavaScript console for technical details", which is useless to someone
// holding a phone -- and indistinguishable from the app being broken. This says which of the four
// causes it actually is, in the order they are worth checking.
export function MapAuthError() {
  const tx = useStrings(S);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{tx.title}</Text>
      <Text style={styles.body}>{tx.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8,
    backgroundColor: '#0b2a6b',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  body: { color: '#fff', opacity: 0.85, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
