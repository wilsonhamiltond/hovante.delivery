import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as api from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';

// Real support channels: the same address and number the site's legal pages publish
// (volao.web: contact, terms, privacy). WhatsApp wants the number with the +1 country code.
const SUPPORT_EMAIL = 'support@volao.com.do';
const SUPPORT_PHONE = '+1 (809) 693-8546';

// The questions, grouped and gated by role. Everyone reaches this screen from the same Cuenta row,
// so a driver is not made to scroll a customer's payment questions to find their own -- and a
// client never sees the merchant's counter explained. Every answer here describes something the
// app actually does; when a flow changes, this text has to change with it.
type QA = { q: string; a: string };
type Group = { title: string; items: QA[]; when?: 'client' | 'driver' | 'merchant' };

const GROUPS: Group[] = [
  {
    title: 'Pedidos',
    when: 'client',
    items: [
      {
        q: '¿Cómo hago un pedido?',
        a: 'Elige un comercio en la pantalla de inicio, agrega productos al carrito y completa el pedido siguiendo los pasos: carrito, ubicación de entrega y nota.',
      },
      {
        q: '¿Puedo pedir de varios comercios a la vez?',
        a: 'No. Cada pedido puede tener productos de un solo comercio. Si agregas algo de otro comercio, se te pedirá vaciar el carrito primero.',
      },
      {
        q: '¿Puedo retirar el pedido yo mismo?',
        a: 'Sí. Al completar el pedido puedes elegir retiro en tienda en lugar de envío a domicilio. En ese caso no se cobra envío y vas a buscarlo al comercio cuando esté listo.',
      },
      {
        q: '¿Cómo sigo mi pedido?',
        a: 'Toca un pedido en “Tus pedidos en curso” (inicio) o en “Mis pedidos”. Verás su estado en tiempo real, con la fecha de cada paso, desde que el comercio lo confirma hasta que llega a tu puerta.',
      },
      {
        q: '¿Qué es el código de entrega?',
        a: 'Es un código de 4 dígitos que aparece en el seguimiento de tu pedido. Dáselo al repartidor al recibir tu pedido: así confirma que la entrega es correcta.',
      },
      {
        q: '¿Cómo pago mi pedido?',
        a: 'Hoy el pago es en efectivo, al recibir el pedido, directamente al repartidor. El pago con tarjeta está en desarrollo.',
      },
      {
        q: '¿Cómo cancelo un pedido?',
        a: 'Desde el seguimiento del pedido, toca “Cancelar pedido”, elige el motivo y confirma. Es posible mientras el comercio no lo haya aceptado; después de eso, escríbenos y lo intentamos contigo.',
      },
      {
        q: '¿Cómo cambio mi dirección de entrega?',
        a: 'Elige la ubicación en el mapa durante el paso de ubicación al hacer el pedido. Tus direcciones más usadas aparecen en el menú “Direcciones”.',
      },
    ],
  },
  {
    title: 'Tus entregas',
    when: 'driver',
    items: [
      {
        q: '¿Cómo veo los pedidos disponibles?',
        a: 'En el mapa de inicio. Cada pedido listo para tomar aparece como un pin, con los que están a menos de 5 km de ti. El mapa se actualiza solo y recibes una notificación cuando entra uno nuevo cerca.',
      },
      {
        q: '¿Cómo tomo y completo una entrega?',
        a: 'Toca el pin para ver el detalle y tomar el pedido. El mapa te guía primero al comercio; al llegar marca “Entrega en camino” y desde ahí te guía hasta el cliente.',
      },
      {
        q: '¿Para qué es el código de entrega?',
        a: 'El cliente tiene un código de 4 dígitos en su pantalla. Pídeselo al entregar: es la confirmación de que el pedido llegó a la persona correcta.',
      },
      {
        q: '¿Tengo que registrar mi vehículo?',
        a: 'Sí. En “Mi vehículo”, dentro de tu cuenta, indica el tipo de vehículo. Marca, modelo, año, color y placa son opcionales, pero ayudan al comercio a identificarte.',
      },
      {
        q: '¿Qué pasa si me quedo sin señal en una entrega?',
        a: 'Puedes seguir trabajando. Las acciones que hagas sin conexión quedan guardadas en el teléfono y se envían solas cuando vuelve internet.',
      },
    ],
  },
  {
    title: 'Tu mostrador',
    when: 'merchant',
    items: [
      {
        q: '¿Cómo me entero de que entró un pedido?',
        a: 'Los pedidos nuevos aparecen solos en el inicio, sin recargar ni volver a entrar, y recibes una notificación en el teléfono.',
      },
      {
        q: '¿Qué pasa cuando acepto un pedido?',
        a: 'Al aceptarlo te preguntamos en cuántos minutos podrás empezar a prepararlo. Ese dato permite avisarle al cliente cuándo estará listo y buscar un repartidor en el momento correcto.',
      },
      {
        q: '¿Puedo rechazar un pedido?',
        a: 'Sí. Si no puedes prepararlo, recházalo desde la misma pantalla: el pedido sale del mostrador y se le informa al cliente.',
      },
      {
        q: '¿Puedo ver dónde está el repartidor?',
        a: 'Sí. Desde el pedido puedes seguir al repartidor en el mapa mientras viene al comercio y mientras lleva la orden al cliente.',
      },
      {
        q: '¿Dónde veo los pedidos ya terminados?',
        a: 'En la pestaña Historial. El inicio muestra solo lo que sigue pendiente en el mostrador.',
      },
    ],
  },
];

export default function HelpScreen() {
  const router = useRouter();
  // Which question is open, keyed "group-index" so groups do not collide.
  const [open, setOpen] = useState<string | null>(null);

  // The role decides which groups show. cachedMe is the profile the account screen already
  // fetched; when it is not there yet (a deep link straight to help), null reads as a client --
  // the same graceful default account.tsx uses.
  const me = api.cachedMe();
  const role: 'client' | 'driver' | 'merchant' =
    me?.isMerchant ? 'merchant' : me?.isDriver ? 'driver' : 'client';
  const groups = GROUPS.filter((g) => !g.when || g.when === role);

  const email = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  const call = () => Linking.openURL(`tel:${SUPPORT_PHONE}`);
  const whatsapp = () => Linking.openURL(`https://wa.me/1${SUPPORT_PHONE}`);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        <Text style={styles.title}>Ayuda</Text>
        <View style={{ width: BACK_BUTTON_WIDTH }} />
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

        {/* FAQ accordion, one card per visible group */}
        <Text style={styles.sectionTitle}>Preguntas frecuentes</Text>
        {groups.map((g, gi) => (
          <View key={g.title} style={gi > 0 ? styles.groupGap : null}>
            <View style={styles.faqCard}>
              {g.items.map((item, i) => {
                const key = `${gi}-${i}`;
                const expanded = open === key;
                return (
                  <View key={item.q} style={[styles.faqItem, i > 0 && styles.faqItemBorder]}>
                    <Pressable style={styles.faqQuestion} onPress={() => setOpen(expanded ? null : key)}>
                      <Text style={styles.faqQuestionText}>{item.q}</Text>
                      <Text style={styles.faqChevron}>{expanded ? '−' : '+'}</Text>
                    </Pressable>
                    {expanded ? <Text style={styles.faqAnswer}>{item.a}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {/* Quick links, by role: the screens this role actually reaches for */}
        <Text style={styles.sectionTitle}>Accesos rápidos</Text>
        <View style={styles.faqCard}>
          {role === 'client' ? (
            <>
              <Pressable style={styles.linkRow} onPress={() => router.push('/orders')}>
                <Text style={styles.linkIcon}>🧾</Text>
                <Text style={styles.linkText}>Mis pedidos</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
              <Pressable style={[styles.linkRow, styles.faqItemBorder]} onPress={() => router.push('/addresses')}>
                <Text style={styles.linkIcon}>📍</Text>
                <Text style={styles.linkText}>Mis direcciones</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
            </>
          ) : role === 'driver' ? (
            <>
              <Pressable style={styles.linkRow} onPress={() => router.push('/vehicle')}>
                <Text style={styles.linkIcon}>🏍️</Text>
                <Text style={styles.linkText}>Mi vehículo</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
              <Pressable style={[styles.linkRow, styles.faqItemBorder]} onPress={() => router.push('/history')}>
                <Text style={styles.linkIcon}>🧾</Text>
                <Text style={styles.linkText}>Historial</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.linkRow} onPress={() => router.push('/merchant-history')}>
              <Text style={styles.linkIcon}>🧾</Text>
              <Text style={styles.linkText}>Historial</Text>
              <Text style={styles.linkChevron}>›</Text>
            </Pressable>
          )}
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
  groupGap: { marginTop: 12 },
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
