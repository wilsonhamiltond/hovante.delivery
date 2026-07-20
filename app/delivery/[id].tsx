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
  const [code, setCode] = useState('');
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

  const openMapCoords = () => {
    if (delivery?.latitude == null || delivery?.longitude == null) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${delivery.latitude},${delivery.longitude}`);
  };
  const openMapAddress = (address?: string | null) => {
    if (!address) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
  };
  const call = (phone?: string | null) => { if (phone) Linking.openURL(`tel:${phone}`); };

  // Every action goes through the outbox: online it applies immediately, offline it queues and the
  // driver still moves on. Either way we return to the route, which flushes and refetches on focus.
  const runAction = async (build: (key: string) => OutboxItem) => {
    if (!token || !delivery) return;
    setBusy(true);
    setError(null);
    const res = await outbox.submit(build(outbox.newKey()));
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo completar la acción.'); return; }
    // Back to the route, which flushes and refetches on focus. Fall back to the home when this screen
    // was opened directly (no history) so the action does not end on a "GO_BACK not handled" error.
    if (router.canGoBack()) router.back();
    else router.replace('/home');
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
          <Text style={styles.number}>{delivery.deliveryNumber ?? 'Entrega'}</Text>
          <View style={[styles.chip, { backgroundColor: s.color }]}><Text style={styles.chipText}>{s.label}</Text></View>
        </View>

        {/* Pickup: where the driver collects the order (merchant). */}
        {delivery.pickupName || delivery.pickupAddress ? (
          <View style={[styles.stopCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={[styles.stopKind, { color: '#b45309' }]}>1 · RECOGER EN</Text>
            <Text style={styles.stopName}>{delivery.pickupName ?? 'Comercio'}</Text>
            {delivery.pickupAddress ? <Text style={styles.stopAddress}>{delivery.pickupAddress}</Text> : null}
            <View style={styles.stopActions}>
              {delivery.pickupAddress ? <Pressable style={styles.smallBtn} onPress={() => openMapAddress(delivery.pickupAddress)}><Text style={styles.smallBtnText}>🗺️ Mapa</Text></Pressable> : null}
              {delivery.pickupPhone ? <Pressable style={styles.smallBtn} onPress={() => call(delivery.pickupPhone)}><Text style={styles.smallBtnText}>📞 {delivery.pickupPhone}</Text></Pressable> : null}
            </View>
          </View>
        ) : null}

        {/* Delivery: where the driver drops it off (client). */}
        <View style={[styles.stopCard, { borderLeftColor: '#16a34a' }]}>
          <Text style={[styles.stopKind, { color: '#15803d' }]}>2 · ENTREGAR A</Text>
          <Text style={styles.stopName}>{delivery.recipientName ?? 'Cliente'}</Text>
          <Text style={styles.stopAddress}>{delivery.addressLine ?? 'Sin dirección'}{delivery.city ? `, ${delivery.city}` : ''}</Text>
          <View style={styles.stopActions}>
            {delivery.latitude != null && delivery.longitude != null ? (
              <Pressable style={styles.smallBtn} onPress={openMapCoords}><Text style={styles.smallBtnText}>🗺️ Mapa</Text></Pressable>
            ) : (delivery.addressLine ? <Pressable style={styles.smallBtn} onPress={() => openMapAddress(delivery.addressLine)}><Text style={styles.smallBtnText}>🗺️ Mapa</Text></Pressable> : null)}
            {delivery.clientPhone ? <Pressable style={styles.smallBtn} onPress={() => call(delivery.clientPhone)}><Text style={styles.smallBtnText}>📞 {delivery.clientPhone}</Text></Pressable> : null}
          </View>
        </View>

        <Pressable style={styles.routeBtn} onPress={() => router.push(`/delivery-map/${delivery.id}`)}>
          <Text style={styles.routeBtnText}>🗺️  Ver ruta en el mapa</Text>
        </Pressable>

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
            <Text style={styles.panelTitle}>Código de entrega</Text>
            <Text style={styles.panelHint}>Pídele al cliente su código de 4 dígitos y escríbelo para confirmar.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="••••"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              textAlign="center"
            />
            <Pressable style={[styles.action, styles.success, code.length !== 4 && styles.disabled]} disabled={busy || code.length !== 4} onPress={() => runAction((key) => ({ key, deliveryId: delivery.id, type: 'deliver', code, createdAt: new Date().toISOString() }))}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Confirmar entrega</Text>}
            </Pressable>
            <Pressable onPress={() => { setPanel('none'); setCode(''); }}><Text style={styles.cancel}>Cancelar</Text></Pressable>
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
  number: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  muted: { color: '#64748b' },
  stopCard: { backgroundColor: '#f8fafc', borderRadius: 12, borderLeftWidth: 4, padding: 14, gap: 4 },
  stopKind: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  stopName: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  stopAddress: { fontSize: 14, color: '#475569' },
  stopActions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  smallBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  smallBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  routeBtn: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  routeBtnText: { color: '#2563eb', fontWeight: '800', fontSize: 15 },
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
  panelHint: { fontSize: 13, color: '#64748b' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  codeInput: { fontSize: 28, fontWeight: '800', letterSpacing: 12, color: '#0f172a' },
  reason: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  reasonActive: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  reasonText: { color: '#475569', fontSize: 15 },
  reasonTextActive: { color: '#dc2626', fontWeight: '600' },
  cancel: { color: '#64748b', textAlign: 'center', paddingVertical: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
