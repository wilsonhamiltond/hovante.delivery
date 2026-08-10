import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { pointsMapHtml } from './pointsMapHtml';
import type { MapPoint } from './routeMapHtml';

// Native: the N-marker map inside a react-native-webview. (Web uses PointsMap.web.tsx instead, so
// react-native-webview never reaches the web bundle.)
export function PointsMap({ points }: { points: MapPoint[] }) {
  const html = useRef(pointsMapHtml(points)).current;
  return (
    <View style={styles.wrap}>
      <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: 'transparent' }} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
