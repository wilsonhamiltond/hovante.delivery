import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { locationPickerHtml, type LocationPickerProps, type PickedLocation } from './mapHtml';

// Web build: renders the Google map in a real <iframe> (this file only loads on web, where the tree
// is React DOM under react-native-web) and listens for the map's postMessage. Keeps
// react-native-webview off the web bundle entirely.
export function LocationPicker({ latitude, longitude, onPick, areas, onOutside, origin }: LocationPickerProps) {
  const html = useRef(locationPickerHtml(latitude, longitude, areas, origin ?? null)).current;
  // Refs so the listener below can subscribe once and still call the current callbacks.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as PickedLocation & { outside?: boolean };
        if (d?.outside) { onOutsideRef.current?.(); return; }
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
