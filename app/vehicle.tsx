import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as api from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import { GradientBackground, t } from '../src/theme';

// The kinds of vehicle a courier can register. The value is what the API stores -- lowercase and
// unaccented so it survives a round trip through any client -- while the label is what is shown.
// "bicicleta" is the one type with no plate to give, which the API also knows.
const TYPES = [
  { value: 'moto', label: 'Moto' },
  { value: 'carro', label: 'Carro' },
  { value: 'bicicleta', label: 'Bicicleta' },
] as const;

// "Mi vehículo": the courier's own vehicle, reached from "Mi cuenta". One vehicle per driver, so
// there is no list and no create-versus-edit -- the screen loads whatever is on record (or nothing,
// for a new driver) and saving upserts it.
export default function VehicleScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [type, setType] = useState<string>('moto');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  // Loaded once on mount rather than on focus: refetching while the driver is mid-edit would
  // overwrite what they had typed with what the server still holds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.myVehicle();
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setNotice({ tone: 'error', message: res.message });
        return;
      }
      // Null data is the expected answer for a driver who has not filled this in yet: leave the
      // form on its defaults rather than treating it as a failure.
      const v = res.data;
      if (!v) return;
      setType(v.type ?? 'moto');
      setBrand(v.brand ?? '');
      setModel(v.model ?? '');
      setYear(v.year != null ? String(v.year) : '');
      setColor(v.color ?? '');
      setPlate(v.plate ?? '');
    })();
    return () => { cancelled = true; };
  }, []);

  const isBicycle = type === 'bicicleta';

  const submit = async () => {
    // Mirrors what SaveMyVehicleAsync refuses, so the common mistakes are caught without a round
    // trip. The server stays the authority.
    if (!type) return setNotice({ tone: 'error', message: 'Elige el tipo de vehículo.' });
    if (!isBicycle && !plate.trim()) {
      return setNotice({ tone: 'error', message: 'Escribe la placa del vehículo.' });
    }
    const parsedYear = year.trim() ? Number(year.trim()) : null;
    if (parsedYear != null && (!Number.isInteger(parsedYear) || parsedYear < 1950 || parsedYear > new Date().getFullYear() + 1)) {
      return setNotice({ tone: 'error', message: 'Escribe un año válido.' });
    }

    setSaving(true);
    const res = await api.saveMyVehicle({
      type,
      brand: brand.trim() || null,
      model: model.trim() || null,
      year: parsedYear,
      color: color.trim() || null,
      // A bicycle keeps no plate even if one was typed before switching type, so what is saved
      // always matches what the form is showing.
      plate: isBicycle ? null : plate.trim().toUpperCase(),
    });
    setSaving(false);

    if (!res.success) {
      setNotice({ tone: 'error', message: res.message });
      return;
    }
    setNotice({ tone: 'success', message: res.message || 'Vehículo guardado.' });
  };

  // Dismissing the success notice leaves the screen; dismissing an error stays put so the fields
  // keep what was typed.
  const dismiss = () => {
    const wasSuccess = notice?.tone === 'success';
    setNotice(null);
    if (wasSuccess) back();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={styles.title}>Mi vehículo</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={t.accent} /></View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.lead}>
                Los datos de tu vehículo ayudan al comercio y al cliente a reconocerte cuando llegas.
              </Text>

              <Text style={styles.label}>Tipo</Text>
              <View style={styles.typeRow}>
                {TYPES.map((option) => {
                  const selected = type === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.typeChip, selected && styles.typeChipOn]}
                      onPress={() => setType(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.typeChipText, selected && styles.typeChipTextOn]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Hidden for a bicycle rather than disabled: there is no plate to ask for, and a
                  greyed-out field still reads like something missing. */}
              {!isBicycle ? (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>Placa</Text>
                  <TextInput
                    style={styles.input}
                    value={plate}
                    onChangeText={setPlate}
                    placeholder="A123456"
                    placeholderTextColor={t.textFaint}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </>
              ) : null}

              <Text style={[styles.label, styles.labelSpaced]}>Marca</Text>
              <TextInput
                style={styles.input}
                value={brand}
                onChangeText={setBrand}
                placeholder="Honda, Yamaha, Toyota…"
                placeholderTextColor={t.textFaint}
              />

              <Text style={[styles.label, styles.labelSpaced]}>Modelo</Text>
              <TextInput
                style={styles.input}
                value={model}
                onChangeText={setModel}
                placeholder="CG 150, Corolla…"
                placeholderTextColor={t.textFaint}
              />

              <Text style={[styles.label, styles.labelSpaced]}>Año</Text>
              <TextInput
                style={styles.input}
                value={year}
                onChangeText={setYear}
                placeholder="2019"
                placeholderTextColor={t.textFaint}
                keyboardType="number-pad"
                maxLength={4}
              />

              <Text style={[styles.label, styles.labelSpaced]}>Color</Text>
              <TextInput
                style={styles.input}
                value={color}
                onChangeText={setColor}
                placeholder="Negro, rojo…"
                placeholderTextColor={t.textFaint}
                onSubmitEditing={submit}
                returnKeyType="done"
              />
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={[styles.primary, saving && styles.disabled]} onPress={submit} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={t.onAccent} />
                  : <Text style={styles.primaryText}>Guardar vehículo</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}

        <NoticeDialog notice={notice} onClose={dismiss} />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  lead: { color: t.textMuted, fontSize: 14, marginBottom: 18 },
  label: { color: t.text, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  labelSpaced: { marginTop: 16 },
  input: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  typeChipOn: { backgroundColor: t.accent, borderColor: t.accent },
  typeChipText: { color: t.text, fontSize: 14, fontWeight: '800' },
  typeChipTextOn: { color: t.onAccent },
  footer: { paddingHorizontal: 16, paddingBottom: 8 },
  primary: {
    backgroundColor: t.accent, borderRadius: 14, minHeight: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
