import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as api from './api';
import type { OrderInvoice } from './api';
import { invoiceHtml } from './invoiceHtml';
import { printHtml } from './printHtml';
import { t } from './theme';

const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

// The order's invoice, opened by tapping its number on the order detail. Fetched on open (one
// order-scoped call; the server assembles company, NCF and lines) and shown the way it prints:
// black on a white sheet, deliberately off the app's gradient -- this is paper. "Imprimir" hands
// the same layout to the OS print flow.
export function InvoiceModal({ orderId, visible, onClose }: {
  orderId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  // The mail flow: one button, one recipient (the customer's own email -- the server accepts no
  // other). Once the server confirms, the confirmation replaces the button.
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !orderId) return;
    let alive = true;
    setInvoice(null);
    setError(null);
    setSending(false);
    setSentTo(null);
    api.merchantOrderInvoice(orderId).then((res) => {
      if (!alive) return;
      if (res.success) setInvoice(res.data);
      else setError(res.message);
    });
    return () => { alive = false; };
  }, [visible, orderId]);

  const print = async () => {
    if (!invoice) return;
    setPrinting(true);
    try {
      await printHtml(invoiceHtml(invoice));
    } catch {
      setError('No se pudo abrir la impresión en este dispositivo.');
    } finally {
      setPrinting(false);
    }
  };

  const send = async () => {
    if (!orderId || !invoice) return;
    setSending(true);
    setError(null);
    const res = await api.emailMerchantOrderInvoice(orderId);
    setSending(false);
    if (res.success) setSentTo(res.data ?? invoice.customerEmail);
    else setError(res.message);
  };

  const symbol = invoice?.currencySymbol || 'RD$';
  const money = (n: number) => `${symbol}${Number(n ?? 0).toFixed(2)}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Factura</Text>

          {!invoice && !error ? <ActivityIndicator color={t.text} style={{ marginVertical: 24 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {invoice ? (
            <ScrollView style={styles.paperScroll} contentContainerStyle={styles.paper}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.companyName}>{invoice.companyName ?? ''}</Text>
                  {invoice.companyRnc ? <Text style={styles.mutedInk}>RNC: {invoice.companyRnc}</Text> : null}
                </View>
                <View style={styles.headRight}>
                  <Text style={styles.docType}>{invoice.documentTypeName ?? 'Factura'}</Text>
                  <Text style={styles.ink}>No.: {invoice.docNumber ?? '-'}</Text>
                  {invoice.ncf ? <Text style={styles.ink}>NCF: {invoice.ncf}</Text> : null}
                  {invoice.ncfTypeName ? <Text style={styles.mutedInk}>{invoice.ncfTypeName}</Text> : null}
                  <Text style={styles.mutedInk}>Fecha: {fmtDate(invoice.issueDate)}</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Cliente</Text>
              <Text style={styles.ink}>{invoice.customerName || '-'}</Text>
              {invoice.customerDocument ? <Text style={styles.mutedInk}>RNC/Cédula: {invoice.customerDocument}</Text> : null}
              {invoice.customerPhone ? <Text style={styles.mutedInk}>{invoice.customerPhone}</Text> : null}
              {invoice.customerAddress ? <Text style={styles.mutedInk}>{invoice.customerAddress}</Text> : null}

              <View style={styles.rule} />
              {invoice.items.map((li, i) => (
                <View key={i} style={styles.line}>
                  <Text style={styles.lineQty}>{li.quantity}×</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ink} numberOfLines={2}>{li.description ?? ''}</Text>
                    <Text style={styles.mutedInk}>
                      {money(li.unitPrice)} c/u{li.taxPct ? ` · Imp. ${li.taxPct}%` : ''}
                    </Text>
                  </View>
                  <Text style={styles.lineTotal}>{money(li.total)}</Text>
                </View>
              ))}

              <View style={styles.rule} />
              <View style={styles.totRow}><Text style={styles.mutedInk}>Subtotal</Text><Text style={styles.ink}>{money(invoice.subtotal)}</Text></View>
              <View style={styles.totRow}><Text style={styles.mutedInk}>Impuesto</Text><Text style={styles.ink}>{money(invoice.taxTotal)}</Text></View>
              {invoice.taxes.map((tx, i) => (
                <View key={i} style={styles.totRow}>
                  <Text style={styles.mutedInk}>{tx.name} ({tx.rate}%)</Text>
                  <Text style={[styles.ink, tx.isRetention && styles.retention]}>
                    {tx.isRetention ? '-' : ''}{money(tx.amount)}
                  </Text>
                </View>
              ))}
              <View style={styles.totRow}>
                <Text style={styles.grand}>Total</Text>
                <Text style={styles.grand}>{money(invoice.grandTotal)}</Text>
              </View>

              {invoice.notes ? <Text style={[styles.mutedInk, { marginTop: 10 }]}>{invoice.notes}</Text> : null}
            </ScrollView>
          ) : null}

          <Pressable
            style={[styles.primary, (!invoice || printing) && styles.disabled]}
            disabled={!invoice || printing}
            onPress={print}
          >
            {printing
              ? <ActivityIndicator color={t.onAccent} />
              : <Text style={styles.primaryText}>🖨️  Imprimir</Text>}
          </Pressable>

          {sentTo ? (
            <Text style={styles.sent}>✓ Factura enviada a {sentTo}</Text>
          ) : invoice && !invoice.customerEmail ? (
            <Text style={styles.noEmail}>El cliente no tiene correo registrado.</Text>
          ) : (
            <Pressable
              style={[styles.secondary, (!invoice || sending) && styles.disabled]}
              disabled={!invoice || sending}
              onPress={send}
            >
              {sending
                ? <ActivityIndicator color={t.text} />
                : (
                  <Text style={styles.secondaryText}>
                    ✉️  Enviar por correo{invoice?.customerEmail ? ` a ${invoice.customerEmail}` : ''}
                  </Text>
                )}
            </Pressable>
          )}

          <Pressable onPress={onClose}>
            <Text style={styles.cancel}>Cerrar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center', maxHeight: '90%',
  },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  error: { color: t.danger, fontSize: 13, fontWeight: '600', marginVertical: 8 },

  // The invoice itself is paper: dark ink on white, a deliberate break from the gradient theme.
  paperScroll: { flexGrow: 0 },
  paper: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, gap: 2 },
  head: { flexDirection: 'row', gap: 12, borderBottomWidth: 2, borderBottomColor: '#1e293b', paddingBottom: 8, marginBottom: 8 },
  headRight: { alignItems: 'flex-end' },
  companyName: { fontSize: 16, fontWeight: '900', color: '#1e293b' },
  docType: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  ink: { fontSize: 13, color: '#1e293b' },
  mutedInk: { fontSize: 12, color: '#64748b' },
  rule: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 3 },
  lineQty: { fontSize: 13, fontWeight: '800', color: '#1e293b', minWidth: 28 },
  lineTotal: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: { fontSize: 15, fontWeight: '900', color: '#1e293b', marginTop: 4 },
  retention: { color: '#dc2626' },

  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  primaryText: { color: t.onAccent, fontSize: 15, fontWeight: '800' },
  secondary: { borderWidth: 1, borderColor: t.border, backgroundColor: t.card, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: t.text, fontSize: 15, fontWeight: '800' },
  sent: { color: t.success, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
  noEmail: { color: t.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  cancel: { color: t.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 10 },
  disabled: { opacity: 0.6 },
});
