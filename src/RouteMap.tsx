import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { routeMapHtml, setDriverJs, type DriverPosition, type RouteMapProps } from './routeMapHtml';
import { MAP_BASE_URL } from './mapHtml';
import { MapAuthError } from './MapAuthError';

// Native: the map inside a react-native-webview. (Web uses RouteMap.web.tsx instead, so
// react-native-webview never reaches the web bundle.)
export function RouteMap({ pickup, client, driver }: RouteMapProps) {
  const html = useRef(routeMapHtml(pickup, client)).current;
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
            const d = JSON.parse(e.nativeEvent.data) as { mapAuthError?: boolean };
            if (d?.mapAuthError) setRefused(true);
          } catch { /* ignore */ }
        }}
      />
      {refused ? <MapAuthError /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
