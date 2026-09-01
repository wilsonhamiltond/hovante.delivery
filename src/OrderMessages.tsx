import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as api from './api';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<
  Locale,
  {
    title: string;
    placeholder: string;
    send: string;
    other: { customer: string; merchant: string };
  }
> = {
  es: {
    title: 'Mensajes',
    placeholder: 'Escribe un mensaje…',
    send: 'Enviar',
    other: { customer: 'Cliente', merchant: 'Comercio' },
  },
  en: {
    title: 'Messages',
    placeholder: 'Write a message…',
    send: 'Send',
    other: { customer: 'Customer', merchant: 'Merchant' },
  },
  fr: {
    title: 'Messages',
    placeholder: 'Écrivez un message…',
    send: 'Envoyer',
    other: { customer: 'Client', merchant: 'Commerce' },
  },
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// The order's customer↔merchant conversation, embedded as a card on either side's order screen.
// `viewer` says which side is reading, so their own messages sit on the right. Polls alongside the
// screens that host it (they refresh every 15 s too); `closed` (delivered/cancelled) hides the
// composer, and a closed, empty thread renders nothing at all.
export function OrderMessages({ orderId, viewer, closed }: {
  orderId: string;
  viewer: 'customer' | 'merchant';
  closed?: boolean;
}) {
  const tx = useStrings(S);
  const [messages, setMessages] = useState<api.OrderMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Send replaces the list from its own response reload; the poll must not clobber a newer list
  // with an older in-flight answer, so each load carries a ticket and stale ones are dropped.
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    const res = await api.orderMessages(orderId);
    if (mine !== ticket.current || !res.success) return;
    setMessages(res.data ?? []);
  }, [orderId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const res = await api.sendOrderMessage(orderId, body);
    setSending(false);
    if (!res.success) { setError(res.message); return; }
    setText('');
    await load();
  };

  if (closed && messages.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{tx.title}</Text>
      {messages.map((m) => {
        const mine = m.sender === viewer;
        return (
          <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {!mine ? (
              <Text style={styles.sender}>
                {m.sender === 'customer' ? tx.other.customer : tx.other.merchant}
              </Text>
            ) : null}
            <Text style={[styles.text, mine && styles.textMine]}>{m.text}</Text>
            <Text style={[styles.time, mine && styles.timeMine]}>{timeOf(m.createdAt)}</Text>
          </View>
        );
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!closed ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={tx.placeholder}
            placeholderTextColor={t.textFaint}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, (sending || !text.trim()) && styles.disabled]}
            disabled={sending || !text.trim()}
            onPress={send}
            accessibilityRole="button"
          >
            {sending ? <ActivityIndicator color={t.onAccent} size="small" /> : <Text style={styles.sendText}>{tx.send}</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  bubble: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: t.accent },
  sender: { fontSize: 11, fontWeight: '800', color: t.textMuted, marginBottom: 2 },
  text: { fontSize: 14, color: t.text },
  textMine: { color: t.onAccent },
  time: { fontSize: 10, color: t.textFaint, marginTop: 3, alignSelf: 'flex-end' },
  timeMine: { color: t.onAccent, opacity: 0.7 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  input: {
    flex: 1, backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: t.text, maxHeight: 96, textAlignVertical: 'top',
  },
  sendBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  sendText: { color: t.onAccent, fontSize: 14, fontWeight: '800' },
  error: { color: t.danger, fontSize: 13, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
