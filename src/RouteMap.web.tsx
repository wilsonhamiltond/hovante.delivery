import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapAuthError } from './MapAuthError';
import { routeMapHtml, type DriverPosition, type RouteMapProps } from './routeMapHtml';

// Web: the map in a real <iframe> (this file only loads on web).
export function RouteMap({ pickup, client, driver }: RouteMapProps) {
  const html = useRef(routeMapHtml(pickup, client)).current;
  const frame = useRef<HTMLIFrameElement>(null);
  const last = useRef(driver ?? null);
  const [refused, setRefused] = useState(false);

  // postMessage rather than reaching into contentWindow: the document listens for the same message
  // whichever host sent it, and this keeps working if the map is ever served from its own origin.
  const push = useCallback((at: DriverPosition) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ driver: at }), '*');
  }, []);

  // The document posts when Google refuses the key, so the screen can say so instead of leaving
  // Google's grey "open the JavaScript console" box in place.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as { mapAuthError?: boolean };
        if (d?.mapAuthError) setRefused(true);
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!driver) return;
    last.current = driver;
    push(driver);
  }, [driver?.lat, driver?.lng, driver?.accuracyM, push]);

  return (
    <View style={styles.wrap}>
      <iframe
        ref={frame}
        srcDoc={html}
        title="Mapa de la ruta"
        style={{ border: 0, width: '100%', height: '100%' }}
        onLoad={() => { if (last.current) push(last.current); }}
      />
      {refused ? <MapAuthError /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
