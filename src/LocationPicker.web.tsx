import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapAuthError } from './MapAuthError';
import { locationPickerHtml, type LocationPickerProps, type PickedLocation } from './mapHtml';
import { useStrings, type Locale } from './i18n';

const S: Record<Locale, { pickLocation: string }> = {
  es: { pickLocation: 'Seleccionar ubicación' },
  en: { pickLocation: 'Pick a location' },
  fr: { pickLocation: 'Choisir un emplacement' },
};

// Web build: renders the Google map in a real <iframe> (this file only loads on web, where the tree
// is React DOM under react-native-web) and listens for the map's postMessage. Keeps
// react-native-webview off the web bundle entirely.
export function LocationPicker({ latitude, longitude, onPick, areas, onOutside, origin }: LocationPickerProps) {
  const tx = useStrings(S);
  const html = useRef(locationPickerHtml(latitude, longitude, areas, origin ?? null)).current;
  // Refs so the listener below can subscribe once and still call the current callbacks.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as PickedLocation & { outside?: boolean; mapAuthError?: boolean };
        if (d?.mapAuthError) { setRefused(true); return; }
        if (d?.outside) { onOutsideRef.current?.(); return; }
        if (d && typeof d.lat === 'number' && typeof d.lng === 'number') onPickRef.current(d);
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <View style={styles.wrap}>
      <iframe srcDoc={html} title={tx.pickLocation} style={{ border: 0, width: '100%', height: '100%' }} />
      {refused ? <MapAuthError /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: 'hidden' },
});
