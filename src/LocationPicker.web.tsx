import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { leafletHtml, type LocationPickerProps, type PickedLocation } from './leafletMap';

// Web build: renders the Leaflet map in a real <iframe> (this file only loads on web, where the tree
// is React DOM under react-native-web) and listens for the map's postMessage. Keeps
// react-native-webview off the web bundle entirely.
export function LocationPicker({ latitude, longitude, onPick }: LocationPickerProps) {
  const html = useRef(leafletHtml(latitude, longitude)).current;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as PickedLocation;
        if (d && typeof d.lat === 'number' && typeof d.lng === 'number') onPickRef.current(d);
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <View style={styles.wrap}>
      <iframe srcDoc={html} title="Seleccionar ubicación" style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: 'hidden' },
});
