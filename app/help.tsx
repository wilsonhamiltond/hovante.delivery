import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GradientBackground, t } from '../src/theme';

// Support channels. 809-555 numbers follow the app's demo convention (fictitious placeholders);
// swap for the real support line/email when going live.
const SUPPORT_EMAIL = 'soporte@hovante.com';
const SUPPORT_PHONE = '8095550100';

// Frequently asked questions, shown as an accordion.
const FAQ: { q: string; a: string }[] = [
  {
    q: '¿Cómo hago un pedido?',
    a: 'Elige un comercio en la pantalla de inicio, agrega productos al carrito y completa el pedido siguiendo los pasos: carrito, ubicación de entrega y nota.',
  },
  {
    q: '¿Puedo pedir de varios comercios a la vez?',
    a: 'No. Cada pedido puede tener productos de un solo comercio. Si agregas algo de otro comercio, se te pedirá vaciar el carrito primero.',
  },
  {
    q: '¿Qué es el código de entrega?',
    a: 'Es un código de 4 dígitos que aparece en el seguimiento de tu pedido. Dáselo al repartidor al recibir tu pedido: así confirma que la entrega es correcta.',
  },
  {
    q: '¿Cómo sigo mi pedido?',
    a: 'Toca un pedido en “Tus pedidos en curso” (inicio) o en “Mis pedidos”. Verás su estado en tiempo real, con la fecha de cada paso, desde que el comercio lo confirma hasta que llega a tu puerta.',
  },
  {
    q: '¿Cómo cambio mi dirección de entrega?',
    a: 'Elige la ubicación en el mapa durante el paso de ubicación al hacer el pedido. Tus direcciones más usadas aparecen en el menú “Direcciones”.',
  },
  {
    q: '¿Cómo pago mi pedido?',
    a: 'El pago se realiza al recibir el pedido, directamente al repartidor.',
  },
  {
    q: '¿Cómo cancelo un pedido?',
    a: 'Contáctanos lo antes posible por los medios de abajo. Un pedido que ya tomó un repartidor no puede cancelarse.',
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);

  const email = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  const call = () => Linking.openURL(`tel:${SUPPORT_PHONE}`);
  const whatsapp = () => Linking.openURL(`https://wa.me/1${SUPPORT_PHONE}`);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} hitSlop={8}>
          <Text style={styles.back}>‹ Atrás</Text>
        </Pressable>
        <Text style={styles.title}>Ayuda</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Contact support */}
        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>¿Necesitas ayuda?</Text>
          <Text style={styles.supportSub}>Estamos para ayudarte. Escríbenos o llámanos.</Text>
          <View style={styles.supportRow}>
            <Pressable style={styles.supportBtn} onPress={whatsapp}>
              <Text style={styles.supportBtnIcon}>💬</Text>
              <Text style={styles.supportBtnText}>WhatsApp</Text>
            </Pressable>
            <Pressable style={styles.supportBtn} onPress={call}>
              <Text style={styles.supportBtnIcon}>📞</Text>
              <Text style={styles.supportBtnText}>Llamar</Text>
            </Pressable>
            <Pressable style={styles.supportBtn} onPress={email}>
              <Text style={styles.supportBtnIcon}>✉️</Text>
              <Text style={styles.supportBtnText}>Correo</Text>
            </Pressable>
          </View>
        </View>

        {/* FAQ accordion */}
        <Text style={styles.sectionTitle}>Preguntas frecuentes</Text>
        <View style={styles.faqCard}>
          {FAQ.map((item, i) => {
            const expanded = open === i;
            return (
              <View key={item.q} style={[styles.faqItem, i > 0 && styles.faqItemBorder]}>
                <Pressable style={styles.faqQuestion} onPress={() => setOpen(expanded ? null : i)}>
                  <Text style={styles.faqQuestionText}>{item.q}</Text>
                  <Text style={styles.faqChevron}>{expanded ? '−' : '+'}</Text>
                </Pressable>
                {expanded ? <Text style={styles.faqAnswer}>{item.a}</Text> : null}
              </View>
            );
          })}
        </View>

        {/* Quick links */}
        <Text style={styles.sectionTitle}>Accesos rápidos</Text>
        <View style={styles.faqCard}>
          <Pressable style={[styles.linkRow]} onPress={() => router.push('/orders')}>
            <Text style={styles.linkIcon}>🧾</Text>
            <Text style={styles.linkText}>Mis pedidos</Text>
            <Text style={styles.linkChevron}>›</Text>
          </Pressable>
          <Pressable style={[styles.linkRow, styles.faqItemBorder]} onPress={() => router.push('/addresses')}>
            <Text style={styles.linkIcon}>📍</Text>
            <Text style={styles.linkText}>Mis direcciones</Text>
            <Text style={styles.linkChevron}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Volao</Text>
      </ScrollView>
    </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  back: { color: t.text, fontWeight: '800', fontSize: 16, width: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: t.text },
  scroll: { padding: 16, paddingBottom: 32 },

  supportCard: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 18 },
  supportTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  supportSub: { fontSize: 13, color: t.textMuted, marginTop: 4 },
  supportRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  supportBtn: { flex: 1, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 4 },
  supportBtnIcon: { fontSize: 20 },
  supportBtnText: { color: t.onAccent, fontWeight: '800', fontSize: 13 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: t.text, marginTop: 24, marginBottom: 10 },
  faqCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, overflow: 'hidden' },
  faqItem: { paddingHorizontal: 16 },
  faqItemBorder: { borderTopWidth: 1, borderTopColor: t.border },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, gap: 12 },
  faqQuestionText: { flex: 1, fontSize: 15, fontWeight: '700', color: t.text },
  faqChevron: { fontSize: 22, fontWeight: '700', color: t.text, width: 20, textAlign: 'center' },
  faqAnswer: { fontSize: 14, color: t.textMuted, lineHeight: 20, paddingBottom: 15 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  linkIcon: { fontSize: 18, width: 22, textAlign: 'center' },
  linkText: { flex: 1, fontSize: 15, fontWeight: '700', color: t.text },
  linkChevron: { fontSize: 20, fontWeight: '800', color: t.text },

  footer: { fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: 28, fontWeight: '600' },
});
