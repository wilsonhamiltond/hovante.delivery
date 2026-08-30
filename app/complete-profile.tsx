import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import {
  detectCurrentLocation, isCompletePhone, LABEL_CHOICES, parsePhone, splitDisplayName, toE164,
  type LabelChoice,
} from '../src/profileForm';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { PhoneInput } from '../src/PhoneInput';
import { DEFAULT_COUNTRY } from '../src/countries';
import type { CountryCode } from 'libphonenumber-js';
import { GradientBackground, t } from '../src/theme';

const STEPS = ['Datos', 'Ubicación'];

// Finishes an account created by a social sign-in. The provider (Apple, Google, Facebook) proved
// the email, supplied the name and stays the credential, so the sign-up wizard's earlier steps
// have nothing to ask: no code to mail, no name to type, no password to choose. What is left is
// how to reach you and where to deliver -- posted to /auth/complete-profile.
//
// Nobody navigates here: the gate in _layout sends every signed-in account that still owes these
// details, so closing the app part-way through lands back here rather than in a half-set-up home.
export default function CompleteProfileScreen() {
  const router = useRouter();
  const { refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The provider's name, carried through for the greeting and the submit -- NEVER asked for.
  // App Review guideline 4 rejects asking for a name or email after Sign in with Apple (it
  // failed the 1.0 submission, and again in 2.0 when the field reappeared for accounts whose
  // stored name had no surname -- Apple only sends the name on the FIRST authorisation, so a
  // returning account carries the email-derived single word instead). Whatever the account
  // holds is kept as-is; only what no provider can give -- the phone and the delivery
  // address -- is asked. The name stays editable later from the account screen.
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  // Step 2: where to deliver.
  const [address, setAddress] = useState('');
  const [labelChoice, setLabelChoice] = useState<LabelChoice | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);

  // Fetches what the account already holds: the provider's name (greeting + silent resubmit) and
  // any stored phone. Anything already typed wins, so a slow response cannot overwrite them.
  useEffect(() => {
    let active = true;
    api.me().then((res) => {
      if (!active || !res.success || !res.data) return;
      // Whatever the provider gave us, re-joined: the profile may already hold a surname of its own
      // (from an earlier attempt), otherwise the display name carries both parts.
      const joined = [res.data.name, res.data.lastName].filter(Boolean).join(' ').trim();
      setFullName((current) => current || joined);
      // Masked on the way in too: a number stored before this format existed would otherwise show
      // raw and then be rejected by the very validation that is about to run on it.
      // Split a stored number back into its country and national part, so an existing one opens on
      // the right flag rather than being read as Dominican.
      const parsed = parsePhone(res.data.phone ?? '');
      setPhone((current) => current || parsed.national);
      setPhoneCountry((current) => (current === DEFAULT_COUNTRY ? parsed.country : current));
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
      // The name is never validated: it was never on screen, and the server keeps whatever the
      // account already holds when it arrives blank.
      if (!phone.trim()) return setError('Ingresa tu teléfono.');
      if (!isCompletePhone(phone, phoneCountry)) return setError('Escribe un número de teléfono válido para el país seleccionado.');
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
    const person = splitDisplayName(fullName);
    const res = await api.completeProfile({
      name: person.name,
      lastName: person.lastName,
      phone: toE164(phone, phoneCountry),
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
            <BackButton onPress={back} />
          ) : (
            <View style={{ width: BACK_BUTTON_WIDTH }} />
          )}
          <Text style={styles.title}>{STEPS[step - 1]}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
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
            {/* Never a name (or email) field here -- guideline 4: the provider already gave them.
                Greet by name only when the stored one looks like a person's (it splits into name
                and surname); the email-derived single-word stand-in reads as noise, not a name. */}
            <Text style={styles.lead}>
              {splitDisplayName(fullName).lastName
                ? `Hola, ${splitDisplayName(fullName).name}. Tu nombre y correo ya vienen de tu cuenta. Solo falta un teléfono de contacto.`
                : 'Tu cuenta ya está verificada. Solo falta un teléfono de contacto.'}
            </Text>
            <Text style={styles.label}>Teléfono</Text>
            <PhoneInput
              country={phoneCountry}
              national={phone}
              onChange={({ country, national }) => { setPhoneCountry(country); setPhone(national); }}
            />

            {/* The details are only truly needed to place an order, so browsing first is allowed
                (guideline 5.1.1: only account-based features may demand them). Checkout brings
                anyone who skipped back here. */}
            <Pressable onPress={() => router.replace('/home')} style={styles.signOut} accessibilityRole="button">
              <Text style={styles.signOutText}>Ahora no, quiero explorar</Text>
            </Pressable>

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
