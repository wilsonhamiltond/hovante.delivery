import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { pointsMapHtml } from './pointsMapHtml';
import { MAP_BASE_URL } from './mapHtml';
import { MapAuthError } from './MapAuthError';
import { setDriverJs, type DriverPosition, type MapPoint } from './routeMapHtml';

export interface PointsMapProps {
  points: MapPoint[];
  /** Fired with the point's id when a pin that has one is tapped. */
  onPointPress?: (id: string) => void;
  /** The driver's own position, re-sent as they move. Omitted or null draws no bike. */
  driver?: DriverPosition | null;
  /** Draw (and keep redrawing) the street route from the driver to the FIRST point. */
  routeFromDriver?: boolean;
}

// Native: the N-marker map inside a react-native-webview. (Web uses PointsMap.web.tsx instead, so
// react-native-webview never reaches the web bundle.)
export function PointsMap({ points, onPointPress, driver, routeFromDriver }: PointsMapProps) {
  const html = useRef(pointsMapHtml(points, routeFromDriver ?? false)).current;
  const webview = useRef<WebView>(null);
  // The last position, so a document that reloads can be caught up without waiting for the driver
  // to move again.
  const last = useRef(driver ?? null);
  const [refused, setRefused] = useState(false);

  const push = useCallback((at: DriverPosition) => {
    // The trailing `true` keeps iOS from warning about the injected script's return value.
    webview.current?.injectJavaScript(`${setDriverJs(at)} true;`);
  }, []);

  useEffect(() => {
    if (!driver) return;
    last.current = driver;
    push(driver);
  }, [driver?.lat, driver?.lng, driver?.accuracyM, push]);

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webview}
        originWhitelist={['*']}
        // baseUrl: without one the document is about:blank, which matches no key restriction.
        source={{ html, baseUrl: MAP_BASE_URL }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onLoadEnd={() => { if (last.current) push(last.current); }}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data) as { pointId?: string; mapAuthError?: boolean };
            if (d?.mapAuthError) { setRefused(true); return; }
            if (d?.pointId) onPointPress?.(d.pointId);
          } catch { /* ignore */ }
        }}
      />
      {refused ? <MapAuthError /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
