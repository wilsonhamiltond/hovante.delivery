import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { routeMapHtml, type RouteMapProps } from './routeMapHtml';

// Native: the two-marker map inside a react-native-webview. (Web uses RouteMap.web.tsx instead, so
// react-native-webview never reaches the web bundle.)
export function RouteMap({ pickup, client }: RouteMapProps) {
  const html = useRef(routeMapHtml(pickup, client)).current;
  return (
    <View style={styles.wrap}>
      <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: 'transparent' }} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
