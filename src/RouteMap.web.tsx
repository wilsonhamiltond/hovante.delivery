import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { routeMapHtml, type RouteMapProps } from './routeMapHtml';

// Web: the two-marker map in a real <iframe> (this file only loads on web).
export function RouteMap({ pickup, client }: RouteMapProps) {
  const html = useRef(routeMapHtml(pickup, client)).current;
  return (
    <View style={styles.wrap}>
      <iframe srcDoc={html} title="Mapa de la ruta" style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
