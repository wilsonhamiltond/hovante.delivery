import type { ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Volao's shared blue-gradient theme: a deep-blue diagonal wash with white text and glassy,
// translucent cards, applied across every screen of the delivery app.
export const GRADIENT = ['#0b2a6b', '#1d4ed8', '#3b82f6'] as const;

export const t = {
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.72)',
  textFaint: 'rgba(255,255,255,0.5)',
  // Glassy surfaces over the gradient.
  card: 'rgba(255,255,255,0.12)',
  cardStrong: 'rgba(255,255,255,0.20)',
  border: 'rgba(255,255,255,0.22)',
  // A near-white accent for primary buttons on the gradient.
  accent: '#ffffff',
  onAccent: '#1d4ed8',
  danger: '#fecaca',
  success: '#bbf7d0',
};

// Full-screen blue gradient. Wrap a screen's content in this and keep inner surfaces transparent.
export function GradientBackground({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, style]}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
