import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import {
  detectCurrentLocation, LABEL_CHOICES, maskDate, splitDisplayName, toIsoDate, type LabelChoice,
} from '../src/profileForm';
import { GradientBackground, t } from '../src/theme';

const STEPS = ['Datos', 'Ubicación'];

// Finishes an account created by a social sign-in. Facebook (or Google) proved the email and stays
// the credential, so the sign-up wizard's first four steps have nothing to ask: no code to mail,
// no address to verify, no password to choose. What is left is who you are and where to deliver --
// the same two steps, posted to /auth/complete-profile.
//
// Nobody navigates here: the gate in _layout sends every signed-in account that still owes these
// details, so closing the app part-way through lands back here rather than in a half-set-up home.
export default function CompleteProfileScreen() {
  const { refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: who you are. Pre-filled from the provider's display name where it can be.
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  // Step 2: where to deliver.
  const [address, setAddress] = useState('');
  const [labelChoice, setLabelChoice] = useState<LabelChoice | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);

  // The provider's name arrives as one string; opening the form pre-filled means most people only
  // confirm it. Anything they have already typed wins, so a slow response cannot overwrite them.
  useEffect(() => {
    let active = true;
    api.me().then((res) => {
      if (!active || !res.success || !res.data) return;
      const split = splitDisplayName(res.data.name);
      setName((current) => current || split.name);
      setLastName((current) => current || res.data.lastName || split.lastName);
      setPhone((current) => current || res.data.phone || '');
    });
    return () => { active = false; };
  }, []);

  const back = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

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

  // "Casa"/"Trabajo" are the label as-is; "Otro" defers to what they typed.
  const addressLabel = labelChoice === 'Otro' ? customLabel.trim() : (labelChoice ?? '');

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) return setError('Ingresa tu nombre.');
      if (!lastName.trim()) return setError('Ingresa tu apellido.');
      if (!phone.trim()) return setError('Ingresa tu teléfono.');
      if (birth.trim() && !toIsoDate(birth)) return setError('La fecha de nacimiento no es válida.');
      return setStep(2);
    }
    return submit();
  };

  const submit = async () => {
    // Checked in the order the fields appear on the step.
    if (!labelChoice) return setError('Elige un nombre para tu dirección.');
    if (!addressLabel) return setError('Escribe el nombre de tu dirección.');
    if (!address.trim()) return setError('Elige tu ubicación en el mapa.');

    setSubmitting(true);
    const res = await api.completeProfile({
      name: name.trim(),
      lastName: lastName.trim(),
      birthDate: toIsoDate(birth),
      phone: phone.trim(),
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      addressLabel,
    });
    if (!res.success) {
      setSubmitting(false);
      setError(res.message);
      setStep(1);
      return;
    }
    // Re-checking the profile is what releases the gate, which then redirects to the home screen.
    await refreshProfile();
    setSubmitting(false);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          {step > 1 ? (
            <Pressable onPress={back} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
          ) : (
            <View style={{ width: 56 }} />
          )}
          <Text style={styles.title}>{STEPS[step - 1]}</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.stepperRow}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
                  <Text style={[styles.stepDotText, (active || done) && { color: t.onAccent }]}>{done ? '✓' : n}</Text>
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {step === 1 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>Ya verificamos tu correo. Solo falta saber quién eres y cómo contactarte.</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Nombre" value={name} onChangeText={setName} />
            <Text style={styles.label}>Apellido</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Apellido" value={lastName} onChangeText={setLastName} />
            <Text style={styles.label}>Teléfono</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="809-000-0000"
              keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="DD/MM/AAAA"
              keyboardType="number-pad" value={birth} onChangeText={(v) => setBirth(maskDate(v))} maxLength={10} />

            <Pressable onPress={signOut} style={styles.signOut} accessibilityRole="button">
              <Text style={styles.signOutText}>Usar otra cuenta</Text>
            </Pressable>
          </ScrollView>
        )}

        {step === 2 && (
          <View style={styles.mapStep}>
            <Text style={[styles.label, styles.labelFirst]}>Nombre de la dirección</Text>
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
        )}

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={next} disabled={submitting}>
            {submitting ? <ActivityIndicator color={t.onAccent} /> : (
              <Text style={styles.primaryText}>{step === 2 ? 'Terminar' : 'Continuar'}</Text>
            )}
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

  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: t.accent },
  stepDotText: { fontSize: 13, fontWeight: '800', color: t.text },
  stepLabel: { fontSize: 12, color: t.textFaint, fontWeight: '600' },
  stepLabelActive: { color: t.text, fontWeight: '800' },

  scroll: { padding: 20, gap: 6, maxWidth: 480, width: '100%', alignSelf: 'center' },
  lead: { flex: 1, color: t.textMuted, fontSize: 14, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 12 },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text, marginTop: 4 },

  signOut: { alignItems: 'center', paddingVertical: 18 },
  signOutText: { color: t.textMuted, fontSize: 14, fontWeight: '700' },

  mapStep: { flex: 1, padding: 20 },
  labelFirst: { marginTop: 0 },
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
  locBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 118, alignItems: 'center' },
  locBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },
  addressArea: { minHeight: 68, textAlignVertical: 'top' },

  footer: { padding: 20, paddingTop: 8, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
