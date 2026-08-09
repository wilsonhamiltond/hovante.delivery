import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { locationPickerHtml, type LocationPickerProps, type PickedLocation } from './mapHtml';

// Native build: the Google map inside a react-native-webview. (On web, LocationPicker.web.tsx is
// used instead, so react-native-webview never reaches the web bundle.)
export function LocationPicker({ latitude, longitude, onPick, areas, onOutside }: LocationPickerProps) {
  // Built once on mount, like the coordinates: the map ignores later prop changes, and callers
  // remount it with a key when they need it rebuilt.
  const html = useRef(locationPickerHtml(latitude, longitude, areas)).current;
  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data) as PickedLocation & { outside?: boolean };
            if (d.outside) { onOutside?.(); return; }
            if (typeof d.lat === 'number' && typeof d.lng === 'number') onPick(d);
          } catch { /* ignore */ }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: 'hidden' },
});
