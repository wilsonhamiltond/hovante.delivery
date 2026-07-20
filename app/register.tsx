import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { GradientBackground, t } from '../src/theme';

type Role = 'client' | 'driver';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>('client');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password || !document.trim()) {
      setError('Nombre, correo, contraseña y documento son requeridos.');
      return;
    }
    setSubmitting(true);
    const err = await signUp({
      type: role,
      name: name.trim(),
      email: email.trim(),
      password,
      phone: phone.trim(),
      document: document.trim(),
      address: address.trim() || undefined,
    });
    setSubmitting(false);
    // On success the gate redirects to /home; only a failure surfaces here.
    if (err) setError(err);
  };

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Crear cuenta</Text>

        <View style={styles.roleRow}>
          {(['client', 'driver'] as Role[]).map((r) => (
            <Pressable
              key={r}
              style={[styles.roleTab, role === r && styles.roleTabActive]}
              onPress={() => setRole(r)}
              disabled={submitting}
            >
              <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                {r === 'client' ? 'Cliente' : 'Repartidor'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Nombre completo" value={name} onChangeText={setName} editable={!submitting} />
        <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!submitting} />
        <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} editable={!submitting} />
        <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Documento (Cédula)" value={document} onChangeText={setDocument} editable={!submitting} />
        <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Teléfono" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!submitting} />
        {role === 'client' ? (
          <TextInput style={styles.input} placeholderTextColor={t.textFaint} placeholder="Dirección de entrega (opcional)" value={address} onChangeText={setAddress} editable={!submitting} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={t.onAccent} /> : <Text style={styles.buttonText}>Registrarme</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tiene cuenta? </Text>
          <Link href="/login" style={styles.link}>Inicie sesión</Link>
        </View>
      </ScrollView>
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: t.text, marginBottom: 6 },
  roleRow: { flexDirection: 'row', backgroundColor: t.card, borderRadius: 10, padding: 4, marginBottom: 6, borderWidth: 1, borderColor: t.border },
  roleTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  roleTabActive: { backgroundColor: t.accent },
  roleText: { fontSize: 15, fontWeight: '700', color: t.textMuted },
  roleTextActive: { color: t.onAccent },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: t.card, color: t.text },
  error: { color: t.danger, fontSize: 14 },
  button: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: t.textMuted },
  link: { color: t.text, fontWeight: '800' },
});
