import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { pointsMapHtml } from './pointsMapHtml';
import type { MapPoint } from './routeMapHtml';

// Web: the N-marker map in a real <iframe> (this file only loads on web).
export function PointsMap({ points }: { points: MapPoint[] }) {
  const html = useRef(pointsMapHtml(points)).current;
  return (
    <View style={styles.wrap}>
      <iframe srcDoc={html} title="Mapa de sucursales" style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
