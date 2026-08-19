import { StyleSheet, Text, View } from 'react-native';

// What a map shows when Google refuses the key (gm_authFailure). Google's own answer is a grey box
// telling you to "see the JavaScript console for technical details", which is useless to someone
// holding a phone -- and indistinguishable from the app being broken. This says which of the four
// causes it actually is, in the order they are worth checking.
export function MapAuthError() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>El mapa no pudo cargarse</Text>
      <Text style={styles.body}>
        Google rechazó la clave de este build. Revisa, en Google Cloud Console: que la clave no
        tenga restricción de aplicación (o que incluya volao.com.do), que estén habilitadas las
        APIs Maps JavaScript y Geocoding, y que el proyecto tenga facturación activa.
      </Text>
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
