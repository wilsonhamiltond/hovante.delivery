import { Image, StyleSheet, View } from 'react-native';
import { GradientBackground } from './theme';

// The Volao logo on the gradient, and nothing else. Shown wherever a screen has nothing to render
// yet -- a profile still loading, or a session that has just expired and is on its way back to
// /login -- so the wait reads as the app opening rather than as something broken.
export function LogoSplash() {
  return (
    <GradientBackground>
      <View style={styles.center}>
        <Image
          source={require('../assets/volao-logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Volao"
        />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo: { width: 260, height: 200 },
});
