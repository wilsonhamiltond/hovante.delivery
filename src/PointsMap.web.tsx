import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapAuthError } from './MapAuthError';
import { pointsMapHtml } from './pointsMapHtml';
import type { DriverPosition } from './routeMapHtml';
import type { PointsMapProps } from './PointsMap';

// Web: the N-marker map in a real <iframe> (this file only loads on web), listening for the map's
// postMessage so a tapped pin reaches the host exactly like the native WebView's onMessage, and
// pushing the driver's position in the same way RouteMap.web does.
export function PointsMap({ points, onPointPress, driver, routeFromDriver }: PointsMapProps) {
  const html = useRef(pointsMapHtml(points, routeFromDriver ?? false)).current;
  const frame = useRef<HTMLIFrameElement>(null);
  const last = useRef(driver ?? null);
  // Ref so the listener subscribes once and still calls the current callback.
  const onPressRef = useRef(onPointPress);
  onPressRef.current = onPointPress;
  const [refused, setRefused] = useState(false);

  // postMessage rather than reaching into contentWindow: the document listens for the same message
  // whichever host sent it, and this keeps working if the map is ever served from its own origin.
  const push = useCallback((at: DriverPosition) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ driver: at }), '*');
  }, []);

  useEffect(() => {
    if (!driver) return;
    last.current = driver;
    push(driver);
  }, [driver?.lat, driver?.lng, driver?.accuracyM, push]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as { pointId?: string; mapAuthError?: boolean };
        if (d?.mapAuthError) { setRefused(true); return; }
        if (d?.pointId) onPressRef.current?.(d.pointId);
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <View style={styles.wrap}>
      <iframe
        ref={frame}
        srcDoc={html}
        title="Mapa de puntos"
        style={{ border: 0, width: '100%', height: '100%' }}
        onLoad={() => { if (last.current) push(last.current); }}
      />
      {refused ? <MapAuthError /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
