import { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import { LocationPicker } from '../src/LocationPicker';
import { DEFAULT_CENTER } from '../src/mapHtml';
import { NoticeDialog, type Notice } from '../src/NoticeDialog';
import {
  detectCurrentLocation, forwardGeocode, isCompletePhone, LABEL_CHOICES, splitDisplayName, toE164,
  type LabelChoice,
} from '../src/profileForm';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { PhoneInput } from '../src/PhoneInput';
import { DEFAULT_COUNTRY } from '../src/countries';
import type { CountryCode } from 'libphonenumber-js';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    steps: string[];
    enterEmail: string;
    enterCode: string;
    codeResent: string;
    enterFullName: string;
    writeFullName: string;
    enterPhone: string;
    invalidPhone: string;
    choosePassword: string;
    passwordTooShort: string;
    confirmYourPassword: string;
    passwordsMismatch: string;
    locPermTitle: string;
    locPermBody: string;
    locTitle: string;
    locFailed: string;
    chooseAddressLabel: string;
    writeAddressLabel: string;
    pickOnMap: string;
    step1Lead: string;
    emailLabel: string;
    emailPlaceholder: string;
    step2Lead: (email: string) => string;
    resendPrompt: string;
    step3Lead: string;
    nameLabel: string;
    namePlaceholder: string;
    phoneLabel: string;
    step4Lead: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    confirmLabel: string;
    confirmPlaceholder: string;
    addressNameLabel: string;
    customLabelPlaceholder: string;
    tapMap: string;
    myLocation: string;
    addressFieldLabel: string;
    addressFieldPlaceholder: string;
    sendCode: string;
    verify: string;
    createAccount: string;
    continueLabel: string;
  }
> = {
  es: {
    steps: ['Correo', 'Código', 'Cuenta', 'Contraseña', 'Ubicación'],
    enterEmail: 'Ingresa tu correo.',
    enterCode: 'Ingresa el código de 6 dígitos.',
    codeResent: 'Te enviamos un código nuevo.',
    enterFullName: 'Ingresa tu nombre y apellido.',
    writeFullName: 'Escribe tu nombre y tu apellido.',
    enterPhone: 'Ingresa tu teléfono.',
    invalidPhone: 'Escribe un número de teléfono válido para el país seleccionado.',
    choosePassword: 'Elige una contraseña.',
    passwordTooShort: 'La contraseña debe tener al menos 7 caracteres.',
    confirmYourPassword: 'Confirma tu contraseña.',
    passwordsMismatch: 'Las contraseñas no coinciden.',
    locPermTitle: 'Permiso de ubicación',
    locPermBody: 'Activa el permiso de ubicación para usar tu ubicación actual.',
    locTitle: 'Ubicación',
    locFailed: 'No se pudo obtener tu ubicación actual.',
    chooseAddressLabel: 'Elige un nombre para tu dirección.',
    writeAddressLabel: 'Escribe el nombre de tu dirección.',
    pickOnMap: 'Elige tu ubicación en el mapa.',
    step1Lead: 'Empecemos por tu correo. Te enviaremos un código para verificarlo.',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'tucorreo@ejemplo.com',
    step2Lead: (email) => `Escribe el código de 6 dígitos que enviamos a ${email}.`,
    resendPrompt: '¿No te llegó? Reenviar código',
    step3Lead: 'Cuéntanos quién eres y cómo contactarte.',
    nameLabel: 'Nombre y apellido',
    namePlaceholder: 'Ana Pérez',
    phoneLabel: 'Teléfono',
    step4Lead: 'Protege tu cuenta. Escribe la misma contraseña dos veces.',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: 'Mínimo 7 caracteres',
    confirmLabel: 'Confirmar contraseña',
    confirmPlaceholder: 'Repite tu contraseña',
    addressNameLabel: 'Nombre de la dirección',
    customLabelPlaceholder: 'Ej. Casa de mamá',
    tapMap: 'Toca el mapa para elegir tu ubicación',
    myLocation: '📍 Mi ubicación',
    addressFieldLabel: 'Dirección',
    addressFieldPlaceholder: 'Escribe y busca, o elige en el mapa',
    sendCode: 'Enviar código',
    verify: 'Verificar',
    createAccount: 'Crear cuenta',
    continueLabel: 'Continuar',
  },
  en: {
    steps: ['Email', 'Code', 'Account', 'Password', 'Location'],
    enterEmail: 'Enter your email.',
    enterCode: 'Enter the 6-digit code.',
    codeResent: 'We sent you a new code.',
    enterFullName: 'Enter your first and last name.',
    writeFullName: 'Write both your first and last name.',
    enterPhone: 'Enter your phone number.',
    invalidPhone: 'Enter a valid phone number for the selected country.',
    choosePassword: 'Choose a password.',
    passwordTooShort: 'The password must be at least 7 characters long.',
    confirmYourPassword: 'Confirm your password.',
    passwordsMismatch: 'The passwords do not match.',
    locPermTitle: 'Location permission',
    locPermBody: 'Enable the location permission to use your current location.',
    locTitle: 'Location',
    locFailed: 'Could not get your current location.',
    chooseAddressLabel: 'Choose a name for your address.',
    writeAddressLabel: 'Type a name for your address.',
    pickOnMap: 'Pick your location on the map.',
    step1Lead: "Let's start with your email. We'll send you a code to verify it.",
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    step2Lead: (email) => `Enter the 6-digit code we sent to ${email}.`,
    resendPrompt: "Didn't get it? Resend code",
    step3Lead: 'Tell us who you are and how to reach you.',
    nameLabel: 'First and last name',
    namePlaceholder: 'Jane Smith',
    phoneLabel: 'Phone',
    step4Lead: 'Protect your account. Type the same password twice.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 7 characters',
    confirmLabel: 'Confirm password',
    confirmPlaceholder: 'Type your password again',
    addressNameLabel: 'Address name',
    customLabelPlaceholder: "e.g. Mom's house",
    tapMap: 'Tap the map to pick your location',
    myLocation: '📍 My location',
    addressFieldLabel: 'Address',
    addressFieldPlaceholder: 'Type and search, or pick on the map',
    sendCode: 'Send code',
    verify: 'Verify',
    createAccount: 'Create account',
    continueLabel: 'Continue',
  },
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
  const tx = useStrings(S);
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
  // The typed-address lookup ("buscar en el mapa") in flight.
  const [searching, setSearching] = useState(false);

  const back = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  // Step 1: ask the API to mail a code. It refuses an address that already has an account, so the
  // person finds out here rather than after filling in everything else.
  const sendCode = async () => {
    if (!email.trim()) return setError(tx.enterEmail);
    setSubmitting(true);
    const res = await api.sendEmailCode(email.trim());
    setSubmitting(false);
    if (!res.success) return setError(res.message);
    setCode('');
    setStep(2);
  };

  // Step 2: prove the address. The API records the verification; register later requires it.
  const verifyCode = async () => {
    if (code.length !== 6) return setError(tx.enterCode);
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
    if (res.success) showInfo(tx.codeResent);
    else setError(res.message);
  };

  const next = () => {
    setError(null);
    if (step === 1) return sendCode();
    if (step === 2) return verifyCode();
    if (step === 3) {
      if (!fullName.trim()) return setError(tx.enterFullName);
      // The account keeps a surname of its own, so one word is not enough to fill it.
      if (!splitDisplayName(fullName).lastName) return setError(tx.writeFullName);
      if (!phone.trim()) return setError(tx.enterPhone);
      // Validity is per country: what is a whole number in one is half of one in another.
      if (!isCompletePhone(phone, phoneCountry)) return setError(tx.invalidPhone);
      return setStep(4);
    }
    if (step === 4) {
      if (!password) return setError(tx.choosePassword);
      if (password.length < 7) return setError(tx.passwordTooShort);
      if (!confirmPassword) return setError(tx.confirmYourPassword);
      if (password !== confirmPassword) return setError(tx.passwordsMismatch);
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
        Alert.alert(tx.locPermTitle, tx.locPermBody);
      } else {
        Alert.alert(tx.locTitle, tx.locFailed);
      }
      return;
    }
    setCoords({ lat: result.location.lat, lng: result.location.lng });
    setMapKey((k) => k + 1);
    if (result.location.address) setAddress(result.location.address);
  };

  // The reverse of tapping the map: geocode what was typed and take the map there, pin dropped.
  // Same behavior as the address-new screen: explicit (search key) rather than as-you-type --
  // every lookup is a billable geocode, and the map remount that recenters it is too heavy to
  // run per keystroke.
  const searchAddress = async () => {
    Keyboard.dismiss();
    if (!address.trim() || searching) return;
    setSearching(true);
    setError(null);
    const found = await forwardGeocode(address);
    setSearching(false);
    // Not found: keep the typed text and the current pin, silently -- the user can keep editing
    // or just pick the point on the map.
    if (!found) return;
    setCoords({ lat: found.lat, lng: found.lng });
    setMapKey((k) => k + 1);
    if (found.address) setAddress(found.address);
  };

  // "Casa"/"Trabajo" are the label as-is; "Otro" defers to what they typed.
  const addressLabel = labelChoice === 'Otro' ? customLabel.trim() : (labelChoice ?? '');

  const submit = async () => {
    // Checked in the order the fields appear on the step.
    if (!labelChoice) return setError(tx.chooseAddressLabel);
    if (!addressLabel) return setError(tx.writeAddressLabel);
    if (!address.trim()) return setError(tx.pickOnMap);
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
          <Text style={styles.title}>{tx.steps[step - 1]}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        <View style={styles.stepperRow}>
          {tx.steps.map((label, i) => {
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
            <Text style={styles.lead}>{tx.step1Lead}</Text>
            <Text style={styles.label}>{tx.emailLabel}</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder={tx.emailPlaceholder}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail}
              // Enter (web) or the keyboard's action key (native) is the "Enviar código" button
              // below: same handler, same validation. Guarded like the button, so a double
              // submit while the code is already being mailed does nothing.
              returnKeyType="send" onSubmitEditing={() => { if (!submitting) next(); }} />
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>{tx.step2Lead(email.trim())}</Text>
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
              <Text style={styles.resendText}>{tx.resendPrompt}</Text>
            </Pressable>
          </ScrollView>
        )}

        {step === 3 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>{tx.step3Lead}</Text>
            <Text style={styles.label}>{tx.nameLabel}</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder={tx.namePlaceholder}
              autoCapitalize="words" value={fullName} onChangeText={setFullName} />
            <Text style={styles.label}>{tx.phoneLabel}</Text>
            <PhoneInput
              country={phoneCountry}
              national={phone}
              onChange={({ country, national }) => { setPhoneCountry(country); setPhone(national); }}
            />
          </ScrollView>
        )}

        {step === 4 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>{tx.step4Lead}</Text>
            <Text style={styles.label}>{tx.passwordLabel}</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder={tx.passwordPlaceholder}
              secureTextEntry value={password} onChangeText={setPassword} />
            <Text style={styles.label}>{tx.confirmLabel}</Text>
            <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder={tx.confirmPlaceholder}
              secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
          </ScrollView>
        )}

        {step === 5 && (
          <View style={styles.mapStep}>
            <Text style={[styles.label, styles.labelFirst]}>{tx.addressNameLabel}</Text>
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
                placeholder={tx.customLabelPlaceholder} value={customLabel} onChangeText={setCustomLabel} />
            ) : null}
            <View style={[styles.locRow, styles.locRowSpaced]}>
              <Text style={styles.lead}>{tx.tapMap}</Text>
              <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
                {locating ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.locBtnText}>{tx.myLocation}</Text>}
              </Pressable>
            </View>
            <LocationPicker
              key={mapKey}
              latitude={coords.lat ?? DEFAULT_CENTER.lat}
              longitude={coords.lng ?? DEFAULT_CENTER.lng}
              onPick={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); if (loc.address) setAddress(loc.address); }}
            />
            <View style={[styles.locRow, styles.locRowSpaced]}>
              <Text style={[styles.label, styles.labelInRow]}>{tx.addressFieldLabel}</Text>
              {searching ? <ActivityIndicator color={t.accent} size="small" /> : null}
            </View>
            {/* The return key searches instead of inserting a newline: an address wants commas, not
                line breaks, and this multiline box otherwise trapped the keyboard open. */}
            <TextInput style={[styles.input, styles.addressArea]} placeholderTextColor={t.textFaint}
              placeholder={tx.addressFieldPlaceholder} value={address} onChangeText={setAddress}
              multiline returnKeyType="search" submitBehavior="blurAndSubmit"
              blurOnSubmit /* react-native-web ignores submitBehavior; without this, Enter on web never submits */
              onSubmitEditing={searchAddress} />
          </View>
        )}

        <View style={styles.footer}>
          <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={next} disabled={submitting}>
            {submitting ? <ActivityIndicator color={t.onAccent} /> : (
              <Text style={styles.primaryText}>
                {step === 1 ? tx.sendCode : step === 2 ? tx.verify : step === 5 ? tx.createAccount : tx.continueLabel}
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
  // The label's own top margin, minus the row's centering -- keeps the row aligned with the spinner.
  labelInRow: { flex: 1, marginTop: 0 },
  addressArea: { minHeight: 68, textAlignVertical: 'top' },
  codeInput: { fontSize: 28, fontWeight: '800', letterSpacing: 10, marginTop: 10 },
  resend: { alignItems: 'center', paddingVertical: 14 },
  resendText: { color: t.text, fontWeight: '700', fontSize: 14 },

  footer: { padding: 20, paddingTop: 8, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
