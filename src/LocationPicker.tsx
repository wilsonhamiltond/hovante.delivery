import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { leafletHtml, type LocationPickerProps, type PickedLocation } from './leafletMap';

// Native build: the Leaflet map inside a react-native-webview. (On web, LocationPicker.web.tsx is
// used instead, so react-native-webview never reaches the web bundle.)
export function LocationPicker({ latitude, longitude, onPick }: LocationPickerProps) {
  const html = useRef(leafletHtml(latitude, longitude)).current;
  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data) as PickedLocation;
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
