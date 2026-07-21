import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/leafletMap';
import { GradientBackground, t } from '../src/theme';

// Same label choices as the sign-up wizard's location step: two one-tap options plus a free-text
// "Otro". Kept in sync by hand -- there is no shared constant yet.
const LABEL_CHOICES = ['Casa', 'Trabajo', 'Otro'] as const;
type LabelChoice = (typeof LABEL_CHOICES)[number];

// Add a new delivery address, reached from the home header's address dropdown. Mirrors register
// step 5: name it, drop a pin, save. The new address becomes the default (the API forces the first
// one to be default regardless).
export default function AddressNewScreen() {
  const router = useRouter();
  const [labelChoice, setLabelChoice] = useState<LabelChoice | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = labelChoice === 'Otro' ? customLabel.trim() : (labelChoice ?? '');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  // Device GPS drops the pin and fills the address, same approach as register/checkout.
  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso de ubicación', 'Activa el permiso de ubicación para usar tu ubicación actual.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });
      setMapKey((k) => k + 1);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`);
        const j = await r.json();
        if (j && j.display_name) setAddress(j.display_name);
      } catch { /* keep whatever address is there if reverse geocoding fails */ }
    } catch {
      Alert.alert('Ubicación', 'No se pudo obtener tu ubicación actual.');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setError(null);
    // Checked in the order the fields appear on the screen.
    if (!labelChoice) return setError('Elige un nombre para tu dirección.');
    if (!label) return setError('Escribe el nombre de tu dirección.');
    if (!address.trim()) return setError('Elige tu ubicación en el mapa.');

    setSubmitting(true);
    const res = await api.createMyAddress({
      label,
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      makeDefault: true,
    });
    setSubmitting(false);
    if (!res.success) return setError(res.message);
    // Home refetches its profile on focus, so the new default shows when we go back.
    back();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={back} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
          <Text style={styles.title}>Nueva dirección</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>Nombre de la dirección</Text>
          <View style={styles.choiceRow}>
            {LABEL_CHOICES.map((choice) => {
              const active = labelChoice === choice;
              return (
                <Pressable
                  key={choice}
                  style={[styles.choice, active && styles.choiceActive]}
                  onPress={() => setLabelChoice(choice)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{choice}</Text>
                </Pressable>
              );
            })}
          </View>
          {labelChoice === 'Otro' ? (
            <TextInput style={styles.input} placeholderTextColor={t.textFaint}
              placeholder="Ej. Casa de mamá" value={customLabel} onChangeText={setCustomLabel} />
          ) : null}

          <View style={[styles.locRow, styles.locRowSpaced]}>
            <Text style={styles.lead}>Toca el mapa para elegir tu ubicación</Text>
            <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
              {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>📍 Mi ubicación</Text>}
            </Pressable>
          </View>
          <LocationPicker
            key={mapKey}
            latitude={coords.lat ?? DEFAULT_CENTER.lat}
            longitude={coords.lng ?? DEFAULT_CENTER.lng}
            onPick={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.address) setAddress(loc.address); }}
          />
          <Text style={styles.label}>Dirección</Text>
          <TextInput style={[styles.input, styles.addressArea]} placeholderTextColor={t.textFaint}
            placeholder="Se llena al elegir en el mapa" value={address} onChangeText={setAddress} multiline />
        </View>

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={save} disabled={submitting}>
            {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.primaryText}>Guardar dirección</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  back: { color: t.text, fontWeight: '800', fontSize: 16, width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },

  body: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 12 },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text, marginTop: 4 },
  addressArea: { minHeight: 68, textAlignVertical: 'top' },

  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  choice: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999,
    borderWidth: 1, borderColor: t.border, backgroundColor: t.card,
  },
  choiceActive: { backgroundColor: t.accent, borderColor: t.accent },
  choiceText: { color: t.textMuted, fontSize: 14, fontWeight: '700' },
  choiceTextActive: { color: t.onAccent, fontWeight: '800' },

  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  locRowSpaced: { marginTop: 16 },
  lead: { flex: 1, color: t.textMuted, fontSize: 14, fontWeight: '600' },
  locBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 118, alignItems: 'center' },
  locBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },

  footer: { padding: 20, paddingTop: 8, gap: 10 },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
