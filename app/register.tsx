import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import {
  detectCurrentLocation, isCompletePhone, LABEL_CHOICES, splitDisplayName, toE164,
  type LabelChoice,
} from '../src/profileForm';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { PhoneInput } from '../src/PhoneInput';
import { DEFAULT_COUNTRY } from '../src/countries';
import type { CountryCode } from 'libphonenumber-js';
import { GradientBackground, t } from '../src/theme';

const STEPS = ['Correo', 'Código', 'Cuenta', 'Contraseña', 'Ubicación'];

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
  // Every message the wizard produces -- field validations and whatever the API answers -- goes
  // through one popup. `setError` reads the same as before at each call site; only the presentation
  // changed. `showInfo` is for the one message that is not a problem (the resent code), which would
  // otherwise be announced in red as though something had gone wrong.
  const [notice, setNotice] = useState<Notice | null>(null);
  const setError = (message: string | null) =>
    setNotice(message ? { tone: 'error', message } : null);
  const showInfo = (message: string) => setNotice({ tone: 'success', message });
  const [submitting, setSubmitting] = useState(false);

  // Step 1-2: the address and the code we mail to it.
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // Step 3. One field for the whole name: the account still stores a name and a surname separately
  // (the API asks for both), so this is split on submit rather than asked for twice.
  // The number is held as the country plus its national part; what gets sent is E.164.
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [fullName, setFullName] = useState('');
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
    if (res.success) showInfo('Te enviamos un código nuevo.');
    else setError(res.message);
  };

  const next = () => {
    setError(null);
    if (step === 1) return sendCode();
    if (step === 2) return verifyCode();
    if (step === 3) {
      if (!fullName.trim()) return setError('Ingresa tu nombre y apellido.');
      // The account keeps a surname of its own, so one word is not enough to fill it.
      if (!splitDisplayName(fullName).lastName) return setError('Escribe tu nombre y tu apellido.');
      if (!phone.trim()) return setError('Ingresa tu teléfono.');
      // Validity is per country: what is a whole number in one is half of one in another.
      if (!isCompletePhone(phone, phoneCountry)) return setError('Escribe un número de teléfono válido para el país seleccionado.');
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

  const submit = async () => {
    // Checked in the order the fields appear on the step.
    if (!labelChoice) return setError('Elige un nombre para tu dirección.');
    if (!addressLabel) return setError('Escribe el nombre de tu dirección.');
    if (!address.trim()) return setError('Elige tu ubicación en el mapa.');
    setSubmitting(true);
    // First word is the name, everything after it the surname -- the same split used to pre-fill a
    // social sign-up from the provider's display name.
    const person = splitDisplayName(fullName);
    const err = await signUp({
      type: 'client',
      email: email.trim(),
      password,
      name: person.name,
      lastName: person.lastName,
      // Stored in E.164 so the number is unambiguous wherever it is read back.
      phone: toE164(phone, phoneCountry),
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
          <BackButton onPress={back} />
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
            <Text style={styles.lead}>Empecemos por tu correo. Te enviaremos un código para verificarlo.</Text>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="tucorreo@ejemplo.com"
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail}
              // Enter (web) or the keyboard's action key (native) is the "Enviar código" button
              // below: same handler, same validation. Guarded like the button, so a double
              // submit while the code is already being mailed does nothing.
              returnKeyType="send" onSubmitEditing={() => { if (!submitting) next(); }} />
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
            <Text style={styles.label}>Nombre y apellido</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Ana Pérez"
              autoCapitalize="words" value={fullName} onChangeText={setFullName} />
            <Text style={styles.label}>Teléfono</Text>
            <PhoneInput
              country={phoneCountry}
              national={phone}
              onChange={({ country, national }) => { setPhoneCountry(country); setPhone(national); }}
            />
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
          <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={next} disabled={submitting}>
            {submitting ? <ActivityIndicator color={t.onAccent} /> : (
              <Text style={styles.primaryText}>
                {step === 1 ? 'Enviar código' : step === 2 ? 'Verificar' : step === 5 ? 'Crear cuenta' : 'Continuar'}
              </Text>
            )}
          </Pressable>
        </View>
        <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
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
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
