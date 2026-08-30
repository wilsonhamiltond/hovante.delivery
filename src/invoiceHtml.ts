import type { OrderInvoice } from './api';
import { getLocale, strings, type Locale } from './i18n';

// The invoice as a printable page, mirroring the web back office's print layout (DocumentPrint):
// company header with RNC, the fiscal identifiers, the customer, the lines and the totals.
// Rendered black-on-white on purpose -- paper, not the app's gradient.
//
// Only the LABELS are localized (Factura, Fecha, Total...); amounts, RNC/NCF identifiers and the
// merchant's own data print exactly as the server sent them.
const S: Record<
  Locale,
  {
    dateLocale: string;
    fallbackTitle: string;
    customer: string;
    customerDoc: string;
    dateLabel: string;
    dueLabel: string;
    thDescription: string;
    thQty: string;
    thPrice: string;
    thDiscount: string;
    thTax: string;
    thTotal: string;
    noLines: string;
    subtotal: string;
    tax: string;
    total: string;
    notes: string;
  }
> = {
  es: {
    dateLocale: 'es-DO',
    fallbackTitle: 'Factura',
    customer: 'Cliente',
    customerDoc: 'RNC/Cédula:',
    dateLabel: 'Fecha:',
    dueLabel: 'Vence:',
    thDescription: 'Descripción',
    thQty: 'Cant.',
    thPrice: 'Precio',
    thDiscount: 'Desc.',
    thTax: 'Imp.',
    thTotal: 'Total',
    noLines: 'Sin líneas',
    subtotal: 'Subtotal',
    tax: 'Impuesto',
    total: 'Total',
    notes: 'Notas',
  },
  en: {
    dateLocale: 'en-US',
    fallbackTitle: 'Invoice',
    customer: 'Customer',
    customerDoc: 'RNC/ID:',
    dateLabel: 'Date:',
    dueLabel: 'Due:',
    thDescription: 'Description',
    thQty: 'Qty',
    thPrice: 'Price',
    thDiscount: 'Disc.',
    thTax: 'Tax',
    thTotal: 'Total',
    noLines: 'No lines',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    notes: 'Notes',
  },
};

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(strings(S).dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

export function invoiceHtml(inv: OrderInvoice): string {
  const tx = strings(S);
  const symbol = inv.currencySymbol || 'RD$';
  const money = (n: number) => `${symbol}${Number(n ?? 0).toFixed(2)}`;

  const lines = inv.items.map((it) => `
    <tr>
      <td>${esc(it.description)}</td>
      <td class="num">${it.quantity}</td>
      <td class="num">${money(it.unitPrice)}</td>
      <td class="num">${it.discountPct ? `${it.discountPct}%` : '-'}</td>
      <td class="num">${it.taxPct ? `${it.taxPct}%` : '-'}</td>
      <td class="num">${money(it.total)}</td>
    </tr>`).join('');

  const otherTaxes = inv.taxes.map((tx) => `
    <div class="totrow${tx.isRetention ? ' retention' : ''}">
      <span>${esc(tx.name)} (${tx.rate}%)</span>
      <span>${tx.isRetention ? '-' : ''}${money(tx.amount)}</span>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="${getLocale()}">
<head>
<meta charset="utf-8">
<title>${esc(inv.docNumber) || tx.fallbackTitle}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }
  .company h1 { font-size: 18px; margin: 0 0 2px; }
  .muted { color: #64748b; }
  .doc { text-align: right; }
  .doc .type { font-size: 15px; font-weight: 700; }
  .section { margin-top: 14px; }
  .section .label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 6px 6px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 6px 6px; }
  .num { text-align: right; white-space: nowrap; }
  th.num { text-align: right; }
  .totals { margin-top: 12px; margin-left: auto; width: 260px; max-width: 100%; }
  .totrow { display: flex; justify-content: space-between; padding: 3px 0; }
  .totrow.grand { border-top: 2px solid #1e293b; margin-top: 4px; padding-top: 6px; font-size: 15px; font-weight: 800; }
  .retention { color: #dc2626; }
  .notes { margin-top: 16px; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="head">
    <div class="company">
      <h1>${esc(inv.companyName)}</h1>
      ${inv.companyRnc ? `<div class="muted">RNC: ${esc(inv.companyRnc)}</div>` : ''}
    </div>
    <div class="doc">
      <div class="type">${esc(inv.documentTypeName) || tx.fallbackTitle}</div>
      <div><strong>No.:</strong> ${esc(inv.docNumber) || '-'}</div>
      ${inv.ncf ? `<div><strong>NCF:</strong> ${esc(inv.ncf)}</div>` : ''}
      ${inv.ncfTypeName ? `<div class="muted">${esc(inv.ncfTypeName)}</div>` : ''}
      <div><strong>${tx.dateLabel}</strong> ${fmtDate(inv.issueDate)}</div>
      ${inv.dueDate ? `<div><strong>${tx.dueLabel}</strong> ${fmtDate(inv.dueDate)}</div>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="label">${tx.customer}</div>
    <div>${esc(inv.customerName) || '-'}</div>
    ${inv.customerDocument ? `<div class="muted">${tx.customerDoc} ${esc(inv.customerDocument)}</div>` : ''}
    ${inv.customerPhone ? `<div class="muted">${esc(inv.customerPhone)}</div>` : ''}
    ${inv.customerAddress ? `<div class="muted">${esc(inv.customerAddress)}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>${tx.thDescription}</th><th class="num">${tx.thQty}</th><th class="num">${tx.thPrice}</th>
        <th class="num">${tx.thDiscount}</th><th class="num">${tx.thTax}</th><th class="num">${tx.thTotal}</th>
      </tr>
    </thead>
    <tbody>${lines || `<tr><td colspan="6" class="muted">${tx.noLines}</td></tr>`}</tbody>
  </table>

  <div class="totals">
    <div class="totrow"><span>${tx.subtotal}</span><span>${money(inv.subtotal)}</span></div>
    <div class="totrow"><span>${tx.tax}</span><span>${money(inv.taxTotal)}</span></div>
    ${otherTaxes}
    <div class="totrow grand"><span>${tx.total}</span><span>${money(inv.grandTotal)}</span></div>
  </div>

  ${inv.notes ? `<div class="notes"><div class="label muted">${tx.notes}</div>${esc(inv.notes)}</div>` : ''}
</body>
</html>`;
}
