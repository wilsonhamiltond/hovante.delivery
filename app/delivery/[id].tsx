import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import * as api from '../../src/api';
import * as outbox from '../../src/outbox';
import type { Delivery } from '../../src/api';
import type { OutboxItem } from '../../src/outbox';

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: '#64748b' },
  ASSIGNED: { label: 'Asignada', color: '#2563eb' },
  IN_TRANSIT: { label: 'En camino', color: '#d97706' },
  DELIVERED: { label: 'Entregada', color: '#16a34a' },
  FAILED: { label: 'Fallida', color: '#dc2626' },
  RETURNED: { label: 'Devuelta', color: '#dc2626' },
  CANCELLED: { label: 'Cancelada', color: '#94a3b8' },
};

const FAIL_REASONS = ['Cliente ausente', 'Dirección incorrecta', 'Cliente rechazó el pedido', 'No se pudo contactar', 'Otro'];

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which inline panel is open, plus its inputs.
  const [panel, setPanel] = useState<'none' | 'deliver' | 'fail'>('none');
  const [receiver, setReceiver] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // The list endpoint is already driver-scoped, so re-use it and pick this stop out of it rather
  // than adding a per-id endpoint.
  const load = useCallback(async () => {
    if (!token) return;
    const res = await api.myDeliveries();
    if (!res.success) { setError(res.message); return; }
    setDelivery((res.data ?? []).find((d) => d.id === id) ?? null);
  }, [token, id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const openMap = () => {
    if (delivery?.latitude == null || delivery?.longitude == null) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${delivery.latitude},${delivery.longitude}`);
  };

  // Every action goes through the outbox: online it applies immediately, offline it queues and the
  // driver still moves on. Either way we return to the route, which flushes and refetches on focus.
  const runAction = async (build: (key: string) => OutboxItem) => {
    if (!token || !delivery) return;
    setBusy(true);
    setError(null);
    const res = await outbox.submit(build(outbox.newKey()));
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo completar la acción.'); return; }
    router.back();
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View></SafeAreaView>;
  }
  if (!delivery) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>Entrega no encontrada.</Text></View></SafeAreaView>;
  }

  const s = STATUS[delivery.status] ?? { label: delivery.status, color: '#64748b' };
  const canStart = delivery.status === 'ASSIGNED' || delivery.status === 'PENDING';
  const canFinish = delivery.status === 'IN_TRANSIT';
  const finished = delivery.status === 'DELIVERED' || delivery.status === 'FAILED';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: true, title: delivery.deliveryNumber ?? 'Entrega' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <Text style={styles.recipient}>{delivery.recipientName ?? 'Destinatario'}</Text>
          <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
        </View>
        <Text style={styles.address}>{delivery.addressLine ?? 'Sin dirección'}{delivery.city ? `, ${delivery.city}` : ''}</Text>

        {delivery.latitude != null && delivery.longitude != null ? (
          <Pressable style={styles.mapBtn} onPress={openMap}><Text style={styles.mapBtnText}>Abrir en mapa</Text></Pressable>
        ) : null}

        {delivery.notes ? <Text style={styles.notes}>Nota: {delivery.notes}</Text> : null}
        {finished && delivery.receiverName ? <Text style={styles.notes}>Recibido por: {delivery.receiverName}</Text> : null}
        {finished && delivery.failureReason ? <Text style={styles.notes}>Motivo: {delivery.failureReason}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        {canStart ? (
          <Pressable style={[styles.action, styles.primary]} disabled={busy} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'start', createdAt: new Date().toISOString() }))}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Iniciar entrega</Text>}
          </Pressable>
        ) : null}

        {canFinish && panel === 'none' ? (
          <View style={{ gap: 10 }}>
            <Pressable style={[styles.action, styles.success]} onPress={() => setPanel('deliver')}><Text style={styles.actionText}>Marcar entregada</Text></Pressable>
            <Pressable style={[styles.action, styles.danger]} onPress={() => setPanel('fail')}><Text style={styles.actionText}>Marcar fallida</Text></Pressable>
          </View>
        ) : null}

        {panel === 'deliver' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>¿Quién recibió?</Text>
            <TextInput style={styles.input} placeholder="Nombre de quien recibe" value={receiver} onChangeText={setReceiver} />
            <Pressable style={[styles.action, styles.success]} disabled={busy} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'deliver', receiverName: receiver, createdAt: new Date().toISOString() }))}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Confirmar entrega</Text>}
            </Pressable>
            <Pressable onPress={() => setPanel('none')}><Text style={styles.cancel}>Cancelar</Text></Pressable>
          </View>
        ) : null}

        {panel === 'fail' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Motivo del fallo</Text>
            {FAIL_REASONS.map((r) => (
              <Pressable key={r} style={[styles.reason, reason === r && styles.reasonActive]} onPress={() => setReason(r)}>
                <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
              </Pressable>
            ))}
            <TextInput style={styles.input} placeholder="Notas (opcional)" value={notes} onChangeText={setNotes} />
            <Pressable style={[styles.action, styles.danger, !reason && styles.disabled]} disabled={busy || !reason} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'fail', reason: reason!, notes, createdAt: new Date().toISOString() }))}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Confirmar fallo</Text>}
            </Pressable>
            <Pressable onPress={() => setPanel('none')}><Text style={styles.cancel}>Cancelar</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipient: { fontSize: 22, fontWeight: '700', color: '#0f172a', flex: 1 },
  address: { fontSize: 15, color: '#475569' },
  muted: { color: '#64748b' },
  mapBtn: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  mapBtnText: { color: '#2563eb', fontWeight: '600' },
  notes: { fontSize: 14, color: '#64748b' },
  error: { color: '#dc2626', fontSize: 14 },
  action: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primary: { backgroundColor: '#2563eb' },
  success: { backgroundColor: '#16a34a' },
  danger: { backgroundColor: '#dc2626' },
  disabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  panel: { gap: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 14, marginTop: 6 },
  panelTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  reason: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  reasonActive: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  reasonText: { color: '#475569', fontSize: 15 },
  reasonTextActive: { color: '#dc2626', fontWeight: '600' },
  cancel: { color: '#64748b', textAlign: 'center', paddingVertical: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
