import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNotices, type Audience } from './notifications';
import { t } from './theme';

// The bell, wherever a home has one -- customer, driver or merchant. Each passes the audience it
// belongs to, because the same button counts three different things: order updates, delivery
// updates, or orders landing on a counter.
//
// One component rather than three copies of the badge: it is the same disc, the same rule for when
// the number shows, and the same destination.
export function NotificationsButton({ audience, style }: {
  audience: Audience;
  /** Margin from the caller's header; everything else about the button lives here. */
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const { unread } = useNotices(audience);

  return (
    <Pressable
      style={[styles.btn, style]}
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
    >
      <FontAwesome5 name="bell" size={14} color={t.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          {/* Past 99 the count stops being a number worth reading and starts breaking the circle. */}
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  // Overhangs the rim, so the count never sits on top of the icon it counts.
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10,
    paddingHorizontal: 5, backgroundColor: t.accent,
    // Against the gradient the white badge and the white-ish rim would merge; the border separates
    // them the way the app's other floating chips do.
    borderWidth: 2, borderColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: t.onAccent, fontSize: 10, fontWeight: '900' },
});
