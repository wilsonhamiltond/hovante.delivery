import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import { detectCurrentLocation } from '../src/profileForm';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';

// Same label choices as the sign-up wizard's location step: two one-tap options plus a free-text
// "Otro". Kept in sync by hand -- there is no shared constant yet.
const LABEL_CHOICES = ['Casa', 'Trabajo', 'Otro'] as const;
type LabelChoice = (typeof LABEL_CHOICES)[number];

// Add or edit a delivery address, reached from the home header's address dropdown and from the
// addresses list. Mirrors register step 5: name it, drop a pin, save.
//
// One screen for both: an `id` param switches it to editing that address, which is the same three
// fields over the same map -- a second screen would be this one with the verb changed.
export default function AddressNewScreen() {
  const router = useRouter();
  // Present when editing; the rest of the row is passed along so the form opens filled without
  // waiting on a round trip (the list already holds every field this screen edits).
  const params = useLocalSearchParams<{ id?: string; label?: string; address?: string; latitude?: string; longitude?: string }>();
  const editingId = typeof params.id === 'string' && params.id ? params.id : null;
  const [labelChoice, setLabelChoice] = useState<LabelChoice | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = labelChoice === 'Otro' ? customLabel.trim() : (labelChoice ?? '');

  // Fill the form from the row being edited, once. A label the user typed themselves is not one of
  // the two presets, so it lands in "Otro" with the text restored.
  useEffect(() => {
    if (!editingId) return;
    const existing = typeof params.label === 'string' ? params.label : '';
    const preset = LABEL_CHOICES.find((c) => c !== 'Otro' && c === existing);
    setLabelChoice(preset ?? 'Otro');
    if (!preset) setCustomLabel(existing);
    setAddress(typeof params.address === 'string' ? params.address : '');
    const lat = Number(params.latitude);
    const lng = Number(params.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCoords({ lat, lng });
      setMapKey((k) => k + 1);
    }
  }, [editingId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  // Device GPS drops the pin and fills the address -- the shared helper, same as register/checkout.
  const useMyLocation = async () => {
    setLocating(true);
    const result = await detectCurrentLocation();
    setLocating(false);
    if (!result.ok) {
      if (result.reason === 'permission') {
        Alert.alert('Permiso de ubicación', 'Activa el permiso de ubicación para usar tu ubicación actual.');
      } else {
        Alert.alert('Ubicación', 'No se pudo obtener tu ubicación actual.');
      }
      return;
    }
    setCoords({ lat: result.location.lat, lng: result.location.lng });
    setMapKey((k) => k + 1);
    if (result.location.address) setAddress(result.location.address);
  };

  const save = async () => {
    setError(null);
    // Checked in the order the fields appear on the screen.
    if (!labelChoice) return setError('Elige un nombre para tu dirección.');
    if (!label) return setError('Escribe el nombre de tu dirección.');
    if (!address.trim()) return setError('Elige tu ubicación en el mapa.');

    setSubmitting(true);
    const payload = {
      label,
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      // Editing keeps whatever the address already was: promoting it is the list's own button, and
      // doing it silently here would move the default every time someone fixed a typo.
      makeDefault: !editingId,
    };
    const res = editingId
      ? await api.updateMyAddress(editingId, payload)
      : await api.createMyAddress(payload);
    setSubmitting(false);
    if (!res.success) return setError(res.message);
    // Home and the list both refetch on focus, so the change shows when we go back.
    back();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={styles.title}>{editingId ? 'Editar dirección' : 'Nueva dirección'}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
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
            {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.primaryText}>{editingId ? 'Guardar cambios' : 'Guardar dirección'}</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
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
