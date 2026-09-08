import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import * as api from './api';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<
  Locale,
  {
    title: string;
    rate: Record<RatingRole, string>;
    commentPlaceholder: string;
    submit: string;
    update: string;
    thanks: string;
  }
> = {
  es: {
    title: 'Calificación',
    rate: { customer: 'Califica al cliente', merchant: 'Califica al comercio', driver: 'Califica al repartidor' },
    commentPlaceholder: 'Comentario (opcional)',
    submit: 'Enviar calificación',
    update: 'Actualizar calificación',
    thanks: '¡Gracias por tu calificación!',
  },
  en: {
    title: 'Rating',
    rate: { customer: 'Rate the customer', merchant: 'Rate the merchant', driver: 'Rate the driver' },
    commentPlaceholder: 'Comment (optional)',
    submit: 'Send rating',
    update: 'Update rating',
    thanks: 'Thanks for your rating!',
  },
  fr: {
    title: 'Évaluation',
    rate: { customer: 'Évaluez le client', merchant: 'Évaluez le commerce', driver: 'Évaluez le livreur' },
    commentPlaceholder: 'Commentaire (facultatif)',
    submit: 'Envoyer l’évaluation',
    update: 'Mettre à jour l’évaluation',
    thanks: 'Merci pour votre évaluation !',
  },
};

export type RatingRole = 'customer' | 'merchant' | 'driver';

type Draft = { stars: number; comment: string; savedStars: number | null; savedComment: string; busy: boolean; error: string | null };

const emptyDraft = (): Draft =>
  ({ stars: 0, comment: '', savedStars: null, savedComment: '', busy: false, error: null });

// Star ratings on a finished order, as a card on each side's order screen. `targets` says who this
// viewer may rate: the customer rates the merchant and the driver, and both of them rate the
// customer back. Already-given stars load back in, and picking again revises them -- the server
// keeps one rating per (order, rater, target).
export function OrderRatingCard({ orderId, targets, style, hideTitle }: {
  orderId: string;
  targets: { role: RatingRole; name?: string | null }[];
  style?: StyleProp<ViewStyle>;
  /** The popup dialog carries its own heading, so the card's would just repeat it. */
  hideTitle?: boolean;
}) {
  const tx = useStrings(S);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const patch = (role: RatingRole, part: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [role]: { ...(prev[role] ?? emptyDraft()), ...part } }));

  // What this viewer already said about the order, so reopening the screen shows the given stars
  // rather than asking again from scratch.
  useEffect(() => {
    let alive = true;
    api.orderRatings(orderId).then((res) => {
      if (!alive || !res.success) return;
      for (const r of res.data ?? []) {
        patch(r.targetRole as RatingRole, {
          stars: r.stars,
          comment: r.comment ?? '',
          savedStars: r.stars,
          savedComment: r.comment ?? '',
        });
      }
    });
    return () => { alive = false; };
  }, [orderId]);

  const submit = async (role: RatingRole) => {
    const d = drafts[role] ?? emptyDraft();
    if (d.stars < 1 || d.busy) return;
    patch(role, { busy: true, error: null });
    const res = await api.rateOrder(orderId, {
      targetRole: role,
      stars: d.stars,
      comment: d.comment.trim() || undefined,
    });
    if (!res.success) { patch(role, { busy: false, error: res.message }); return; }
    patch(role, { busy: false, savedStars: d.stars, savedComment: d.comment.trim() });
  };

  if (targets.length === 0) return null;

  return (
    <View style={[styles.card, style]}>
      {!hideTitle ? <Text style={styles.label}>{tx.title}</Text> : null}
      {targets.map(({ role, name }) => {
        const d = drafts[role] ?? emptyDraft();
        // The button only appears while there is something new to send: nothing picked yet means
        // nothing to save, and a saved rating resurfaces it only once the stars or comment move.
        const dirty = d.stars >= 1
          && (d.stars !== d.savedStars || d.comment.trim() !== d.savedComment);
        return (
          <View key={role} style={styles.target}>
            <Text style={styles.heading}>
              {tx.rate[role]}
              {name ? <Text style={styles.name}> · {name}</Text> : null}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => patch(role, { stars: n })}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} ★`}
                >
                  <Text style={[styles.star, n <= d.stars && styles.starOn]}>★</Text>
                </Pressable>
              ))}
            </View>
            {d.stars >= 1 ? (
              <TextInput
                style={styles.comment}
                placeholder={tx.commentPlaceholder}
                placeholderTextColor={t.textFaint}
                value={d.comment}
                onChangeText={(v) => patch(role, { comment: v })}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            ) : null}
            {d.error ? <Text style={styles.error}>{d.error}</Text> : null}
            {dirty ? (
              <Pressable
                style={[styles.submit, d.busy && styles.disabled]}
                disabled={d.busy}
                onPress={() => submit(role)}
                accessibilityRole="button"
              >
                {d.busy
                  ? <ActivityIndicator color={t.onAccent} size="small" />
                  : <Text style={styles.submitText}>{d.savedStars != null ? tx.update : tx.submit}</Text>}
              </Pressable>
            ) : d.savedStars != null ? (
              <Text style={styles.thanks}>{tx.thanks}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  target: { gap: 8 },
  heading: { fontSize: 15, fontWeight: '800', color: t.text },
  name: { fontWeight: '600', color: t.textMuted },
  starsRow: { flexDirection: 'row', gap: 10 },
  star: { fontSize: 30, lineHeight: 34, color: 'rgba(255,255,255,0.28)' },
  starOn: { color: '#facc15' },
  comment: {
    backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: t.text,
  },
  submit: { backgroundColor: t.accent, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  submitText: { color: t.onAccent, fontSize: 14, fontWeight: '800' },
  thanks: { color: t.success, fontSize: 13, fontWeight: '700' },
  error: { color: t.danger, fontSize: 13 },
  disabled: { opacity: 0.6 },
});
