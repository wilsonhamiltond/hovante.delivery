import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/leafletMap';
import { GradientBackground, t } from '../src/theme';

const STEPS = ['Correo', 'Código', 'Cuenta', 'Contraseña', 'Ubicación'];

// What the saved address gets called. The first two are one tap; "Otro" opens a free-text box so
// the label is still the customer's own words.
const LABEL_CHOICES = ['Casa', 'Trabajo', 'Otro'] as const;
type LabelChoice = (typeof LABEL_CHOICES)[number];

// Turns typed digits into DD/MM/AAAA as you go, so no date-picker dependency is needed.
const maskDate = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
};

// DD/MM/AAAA -> yyyy-MM-dd, or null when it is not a real past date.
const toIsoDate = (masked: string): string | null => {
  const m = masked.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = +dd, month = +mm, year = +yyyy;
  const d = new Date(year, month - 1, day);
  const real = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  if (!real || d >= new Date()) return null;
  return `${yyyy}-${mm}-${dd}`;
};

// Sign-up wizard, reached from the welcome screen's "Continuar con correo o teléfono":
// 1) the email, which we mail a code to, 2) that code, 3) contact details and who you are,
// 4) the password, typed twice, 5) where to deliver. The address is proven before anything else
// is collected.
//
// Customers only. Driver accounts are created from the ERP (hovante.web), not self-service -- the
// API rejects a driver self-registration too, so removing the option here is not the only guard.
export default function RegisterScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1-2: the address and the code we mail to it.
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // Step 3
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birth, setBirth] = useState('');
  // Step 4
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Step 5
  const [address, setAddress] = useState('');
  const [labelChoice, setLabelChoice] = useState<LabelChoice | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [mapKey, setMapKey] = useState(0);
  const [locating, setLocating] = useState(false);

  const back = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  // Step 1: ask the API to mail a code. It refuses an address that already has an account, so the
  // person finds out here rather than after filling in everything else.
  const sendCode = async () => {
    if (!email.trim()) return setError('Ingresa tu correo.');
    setSubmitting(true);
    const res = await api.sendEmailCode(email.trim());
    setSubmitting(false);
    if (!res.success) return setError(res.message);
    setCode('');
    setStep(2);
  };

  // Step 2: prove the address. The API records the verification; register later requires it.
  const verifyCode = async () => {
    if (code.length !== 6) return setError('Ingresa el código de 6 dígitos.');
    setSubmitting(true);
    const res = await api.verifyEmailCode(email.trim(), code);
    setSubmitting(false);
    if (!res.success) return setError(res.message);
    setStep(3);
  };

  const resend = async () => {
    setError(null);
    setSubmitting(true);
    const res = await api.sendEmailCode(email.trim());
    setSubmitting(false);
    setError(res.success ? 'Te enviamos un código nuevo.' : res.message);
  };

  const next = () => {
    setError(null);
    if (step === 1) return sendCode();
    if (step === 2) return verifyCode();
    if (step === 3) {
      if (!phone.trim()) return setError('Ingresa tu teléfono.');
      if (!name.trim()) return setError('Ingresa tu nombre.');
      if (!lastName.trim()) return setError('Ingresa tu apellido.');
      if (birth.trim() && !toIsoDate(birth)) return setError('La fecha de nacimiento no es válida.');
      return setStep(4);
    }
    if (step === 4) {
      if (!password) return setError('Elige una contraseña.');
      if (password.length < 7) return setError('La contraseña debe tener al menos 7 caracteres.');
      if (!confirmPassword) return setError('Confirma tu contraseña.');
      if (password !== confirmPassword) return setError('Las contraseñas no coinciden.');
      return setStep(5);
    }
    return submit();
  };

  // Uses the device GPS to drop the pin and fill the address (same approach as checkout).
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

  // "Casa"/"Trabajo" are the label as-is; "Otro" defers to what they typed.
  const addressLabel = labelChoice === 'Otro' ? customLabel.trim() : (labelChoice ?? '');

  const submit = async () => {
    // Checked in the order the fields appear on the step.
    if (!labelChoice) return setError('Elige un nombre para tu dirección.');
    if (!addressLabel) return setError('Escribe el nombre de tu dirección.');
    if (!address.trim()) return setError('Elige tu ubicación en el mapa.');
    setSubmitting(true);
    const err = await signUp({
      type: 'client',
      email: email.trim(),
      password,
      name: name.trim(),
      lastName: lastName.trim(),
      birthDate: toIsoDate(birth),
      phone: phone.trim(),
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      addressLabel,
    });
    setSubmitting(false);
    // On success the gate in _layout redirects to the home; only a failure surfaces here.
    if (err) { setError(err); setStep(1); }
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={back} hitSlop={8}><Text style={styles.back}>‹ Atrás</Text></Pressable>
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
            <Text style={styles.lead}>Empecemos por tu correo. Te enviaremos un código para verificarlo.</Text>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="tucorreo@ejemplo.com"
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>Escribe el código de 6 dígitos que enviamos a {email.trim()}.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholderTextColor={t.textFaint}
              placeholder="••••••"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            />
            <Pressable onPress={resend} disabled={submitting} style={styles.resend}>
              <Text style={styles.resendText}>¿No te llegó? Reenviar código</Text>
            </Pressable>
          </ScrollView>
        )}

        {step === 3 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>Cuéntanos quién eres y cómo contactarte.</Text>
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
          </ScrollView>
        )}

        {step === 4 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>Protege tu cuenta. Escribe la misma contraseña dos veces.</Text>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Mínimo 7 caracteres"
              secureTextEntry value={password} onChangeText={setPassword} />
            <Text style={styles.label}>Confirmar contraseña</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Repite tu contraseña"
              secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
          </ScrollView>
        )}

        {step === 5 && (
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
              <Text style={styles.primaryText}>
                {step === 1 ? 'Enviar código' : step === 2 ? 'Verificar' : step === 5 ? 'Crear cuenta' : 'Continuar'}
              </Text>
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
  codeInput: { fontSize: 28, fontWeight: '800', letterSpacing: 10, marginTop: 10 },
  resend: { alignItems: 'center', paddingVertical: 14 },
  resendText: { color: t.text, fontWeight: '700', fontSize: 14 },

  footer: { padding: 20, paddingTop: 8, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  error: { color: t.danger, fontSize: 14, textAlign: 'center' },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
