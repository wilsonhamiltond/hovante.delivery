import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as api from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

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

const S: Record<
  Locale,
  {
    title: string;
    supportTitle: string;
    supportSub: string;
    call: string;
    email: string;
    faqTitle: string;
    quickLinks: string;
    myOrders: string;
    myAddresses: string;
    myVehicle: string;
    history: string;
    groups: Group[];
  }
> = {
  es: {
    title: 'Ayuda',
    supportTitle: '¿Necesitas ayuda?',
    supportSub: 'Estamos para ayudarte. Escríbenos o llámanos.',
    call: 'Llamar',
    email: 'Correo',
    faqTitle: 'Preguntas frecuentes',
    quickLinks: 'Accesos rápidos',
    myOrders: 'Mis pedidos',
    myAddresses: 'Mis direcciones',
    myVehicle: 'Mi vehículo',
    history: 'Historial',
    groups: [
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
    ],
  },
  en: {
    title: 'Help',
    supportTitle: 'Need help?',
    supportSub: "We're here for you. Message us or give us a call.",
    call: 'Call',
    email: 'Email',
    faqTitle: 'Frequently asked questions',
    quickLinks: 'Quick links',
    myOrders: 'My orders',
    myAddresses: 'My addresses',
    myVehicle: 'My vehicle',
    history: 'History',
    groups: [
      {
        title: 'Orders',
        when: 'client',
        items: [
          {
            q: 'How do I place an order?',
            a: 'Pick a store on the home screen, add products to your cart, and complete the order by following the steps: cart, delivery location, and note.',
          },
          {
            q: 'Can I order from several stores at once?',
            a: "No. Each order can only contain products from a single store. If you add something from another store, you'll be asked to empty your cart first.",
          },
          {
            q: 'Can I pick up the order myself?',
            a: "Yes. When completing the order you can choose in-store pickup instead of home delivery. In that case there's no delivery fee, and you go pick it up at the store once it's ready.",
          },
          {
            q: 'How do I track my order?',
            a: 'Tap an order under "Your orders in progress" (home) or in "My orders". You\'ll see its status in real time, with the date of each step, from the moment the store confirms it until it reaches your door.',
          },
          {
            q: 'What is the delivery code?',
            a: "It's a 4-digit code shown on your order's tracking screen. Give it to the driver when you receive your order: that's how they confirm the delivery is correct.",
          },
          {
            q: 'How do I pay for my order?',
            a: 'For now, payment is in cash, upon receiving your order, directly to the driver. Card payment is in the works.',
          },
          {
            q: 'How do I cancel an order?',
            a: 'From the order tracking screen, tap "Cancel order", choose the reason, and confirm. This is possible as long as the store hasn\'t accepted it yet; after that, write to us and we\'ll try to sort it out with you.',
          },
          {
            q: 'How do I change my delivery address?',
            a: 'Choose the location on the map during the location step when placing your order. Your most-used addresses appear in the "Addresses" menu.',
          },
        ],
      },
      {
        title: 'Your deliveries',
        when: 'driver',
        items: [
          {
            q: 'How do I see available orders?',
            a: 'On the home map. Every order ready to be picked up appears as a pin, showing the ones within 5 km of you. The map refreshes on its own, and you get a notification when a new one comes in nearby.',
          },
          {
            q: 'How do I take and complete a delivery?',
            a: 'Tap the pin to see the details and take the order. The map first guides you to the store; when you arrive, mark "Delivery on the way" and from there it guides you to the customer.',
          },
          {
            q: 'What is the delivery code for?',
            a: "The customer has a 4-digit code on their screen. Ask for it when handing over the order: it's the confirmation that the order reached the right person.",
          },
          {
            q: 'Do I have to register my vehicle?',
            a: 'Yes. In "My vehicle", inside your account, choose your vehicle type. Make, model, year, color, and plate are optional, but they help the store identify you.',
          },
          {
            q: 'What happens if I lose signal during a delivery?',
            a: 'You can keep working. Anything you do while offline is saved on your phone and sent automatically once the internet comes back.',
          },
        ],
      },
      {
        title: 'Your counter',
        when: 'merchant',
        items: [
          {
            q: 'How do I know when an order comes in?',
            a: 'New orders appear on the home screen by themselves, without reloading or signing back in, and you get a notification on your phone.',
          },
          {
            q: 'What happens when I accept an order?',
            a: "When you accept it, we ask how many minutes until you can start preparing it. That lets us tell the customer when it will be ready and look for a driver at the right moment.",
          },
          {
            q: 'Can I reject an order?',
            a: "Yes. If you can't prepare it, reject it from the same screen: the order leaves your counter and the customer is informed.",
          },
          {
            q: 'Can I see where the driver is?',
            a: 'Yes. From the order you can follow the driver on the map while they head to your store and while they take the order to the customer.',
          },
          {
            q: 'Where do I see completed orders?',
            a: 'In the History tab. The home screen only shows what is still pending at the counter.',
          },
        ],
      },
    ],
  },
  fr: {
    title: 'Aide',
    supportTitle: 'Besoin d’aide ?',
    supportSub: 'Nous sommes là pour vous aider. Écrivez-nous ou appelez-nous.',
    call: 'Appeler',
    email: 'E-mail',
    faqTitle: 'Questions fréquentes',
    quickLinks: 'Accès rapides',
    myOrders: 'Mes commandes',
    myAddresses: 'Mes adresses',
    myVehicle: 'Mon véhicule',
    history: 'Historique',
    groups: [
      {
        title: 'Commandes',
        when: 'client',
        items: [
          {
            q: 'Comment passer une commande ?',
            a: 'Choisissez un commerce sur l’écran d’accueil, ajoutez des produits au panier et finalisez la commande en suivant les étapes : panier, lieu de livraison et note.',
          },
          {
            q: 'Puis-je commander dans plusieurs commerces à la fois ?',
            a: 'Non. Chaque commande ne peut contenir que des produits d’un seul commerce. Si vous ajoutez un article d’un autre commerce, il vous sera demandé de vider d’abord votre panier.',
          },
          {
            q: 'Puis-je retirer la commande moi-même ?',
            a: 'Oui. En finalisant la commande, vous pouvez choisir le retrait en magasin au lieu de la livraison à domicile. Dans ce cas, aucuns frais de livraison ne sont facturés et vous allez la chercher au commerce quand elle est prête.',
          },
          {
            q: 'Comment suivre ma commande ?',
            a: 'Touchez une commande dans « Vos commandes en cours » (accueil) ou dans « Mes commandes ». Vous verrez son statut en temps réel, avec la date de chaque étape, depuis la confirmation par le commerce jusqu’à l’arrivée à votre porte.',
          },
          {
            q: 'Qu’est-ce que le code de livraison ?',
            a: 'C’est un code à 4 chiffres qui apparaît dans le suivi de votre commande. Donnez-le au livreur en recevant votre commande : c’est ainsi qu’il confirme que la livraison est correcte.',
          },
          {
            q: 'Comment payer ma commande ?',
            a: 'Pour le moment, le paiement se fait en espèces, à la réception de la commande, directement au livreur. Le paiement par carte est en cours de développement.',
          },
          {
            q: 'Comment annuler une commande ?',
            a: 'Depuis le suivi de la commande, touchez « Annuler la commande », choisissez le motif et confirmez. C’est possible tant que le commerce ne l’a pas acceptée ; après cela, écrivez-nous et nous essaierons avec vous.',
          },
          {
            q: 'Comment changer mon adresse de livraison ?',
            a: 'Choisissez l’emplacement sur la carte lors de l’étape de localisation en passant la commande. Vos adresses les plus utilisées apparaissent dans le menu « Adresses ».',
          },
        ],
      },
      {
        title: 'Vos livraisons',
        when: 'driver',
        items: [
          {
            q: 'Comment voir les commandes disponibles ?',
            a: 'Sur la carte de l’accueil. Chaque commande prête à être prise apparaît comme un repère, avec celles situées à moins de 5 km de vous. La carte se met à jour toute seule et vous recevez une notification quand une nouvelle arrive à proximité.',
          },
          {
            q: 'Comment prendre et effectuer une livraison ?',
            a: 'Touchez le repère pour voir le détail et prendre la commande. La carte vous guide d’abord vers le commerce ; à votre arrivée, marquez « Livraison en route » et de là elle vous guide jusqu’au client.',
          },
          {
            q: 'À quoi sert le code de livraison ?',
            a: 'Le client a un code à 4 chiffres sur son écran. Demandez-le-lui en livrant : c’est la confirmation que la commande est arrivée à la bonne personne.',
          },
          {
            q: 'Dois-je enregistrer mon véhicule ?',
            a: 'Oui. Dans « Mon véhicule », dans votre compte, indiquez le type de véhicule. La marque, le modèle, l’année, la couleur et la plaque sont facultatifs, mais ils aident le commerce à vous identifier.',
          },
          {
            q: 'Que se passe-t-il si je perds le signal pendant une livraison ?',
            a: 'Vous pouvez continuer à travailler. Les actions effectuées hors connexion sont enregistrées sur le téléphone et envoyées automatiquement dès que l’internet revient.',
          },
        ],
      },
      {
        title: 'Votre comptoir',
        when: 'merchant',
        items: [
          {
            q: 'Comment savoir qu’une commande est arrivée ?',
            a: 'Les nouvelles commandes apparaissent d’elles-mêmes sur l’accueil, sans recharger ni vous reconnecter, et vous recevez une notification sur le téléphone.',
          },
          {
            q: 'Que se passe-t-il quand j’accepte une commande ?',
            a: 'En l’acceptant, nous vous demandons dans combien de minutes vous pourrez commencer à la préparer. Cette information permet d’indiquer au client quand elle sera prête et de chercher un livreur au bon moment.',
          },
          {
            q: 'Puis-je refuser une commande ?',
            a: 'Oui. Si vous ne pouvez pas la préparer, refusez-la depuis le même écran : la commande quitte le comptoir et le client en est informé.',
          },
          {
            q: 'Puis-je voir où se trouve le livreur ?',
            a: 'Oui. Depuis la commande, vous pouvez suivre le livreur sur la carte pendant qu’il vient au commerce et pendant qu’il apporte la commande au client.',
          },
          {
            q: 'Où voir les commandes déjà terminées ?',
            a: 'Dans l’onglet Historique. L’accueil ne montre que ce qui reste en attente au comptoir.',
          },
        ],
      },
    ],
  },
};

export default function HelpScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  // Which question is open, keyed "group-index" so groups do not collide.
  const [open, setOpen] = useState<string | null>(null);

  // The role decides which groups show. cachedMe is the profile the account screen already
  // fetched; when it is not there yet (a deep link straight to help), null reads as a client --
  // the same graceful default account.tsx uses.
  const me = api.cachedMe();
  const role: 'client' | 'driver' | 'merchant' =
    me?.isMerchant ? 'merchant' : me?.isDriver ? 'driver' : 'client';
  const groups = tx.groups.filter((g) => !g.when || g.when === role);

  const email = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  const call = () => Linking.openURL(`tel:${SUPPORT_PHONE}`);
  const whatsapp = () => Linking.openURL(`https://wa.me/1${SUPPORT_PHONE}`);

  return (
    <GradientBackground>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        <Text style={styles.title}>{tx.title}</Text>
        <View style={{ width: BACK_BUTTON_WIDTH }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Contact support */}
        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>{tx.supportTitle}</Text>
          <Text style={styles.supportSub}>{tx.supportSub}</Text>
          <View style={styles.supportRow}>
            <Pressable style={styles.supportBtn} onPress={whatsapp}>
              <Text style={styles.supportBtnIcon}>💬</Text>
              <Text style={styles.supportBtnText}>WhatsApp</Text>
            </Pressable>
            <Pressable style={styles.supportBtn} onPress={call}>
              <Text style={styles.supportBtnIcon}>📞</Text>
              <Text style={styles.supportBtnText}>{tx.call}</Text>
            </Pressable>
            <Pressable style={styles.supportBtn} onPress={email}>
              <Text style={styles.supportBtnIcon}>✉️</Text>
              <Text style={styles.supportBtnText}>{tx.email}</Text>
            </Pressable>
          </View>
        </View>

        {/* FAQ accordion, one card per visible group */}
        <Text style={styles.sectionTitle}>{tx.faqTitle}</Text>
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
        <Text style={styles.sectionTitle}>{tx.quickLinks}</Text>
        <View style={styles.faqCard}>
          {role === 'client' ? (
            <>
              <Pressable style={styles.linkRow} onPress={() => router.push('/orders')}>
                <Text style={styles.linkIcon}>🧾</Text>
                <Text style={styles.linkText}>{tx.myOrders}</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
              <Pressable style={[styles.linkRow, styles.faqItemBorder]} onPress={() => router.push('/addresses')}>
                <Text style={styles.linkIcon}>📍</Text>
                <Text style={styles.linkText}>{tx.myAddresses}</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
            </>
          ) : role === 'driver' ? (
            <>
              <Pressable style={styles.linkRow} onPress={() => router.push('/vehicle')}>
                <Text style={styles.linkIcon}>🏍️</Text>
                <Text style={styles.linkText}>{tx.myVehicle}</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
              <Pressable style={[styles.linkRow, styles.faqItemBorder]} onPress={() => router.push('/history')}>
                <Text style={styles.linkIcon}>🧾</Text>
                <Text style={styles.linkText}>{tx.history}</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.linkRow} onPress={() => router.push('/merchant-history')}>
              <Text style={styles.linkIcon}>🧾</Text>
              <Text style={styles.linkText}>{tx.history}</Text>
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
