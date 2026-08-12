'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Building2, FileText, Download, Loader2,
  Trash2, ChevronDown, AlertCircle, Receipt,
} from 'lucide-react';
import {
  useOrgRates, useInvoices, useCreateInvoice,
  useUpdateInvoiceStatus, useDeleteInvoice, downloadInvoicePdf,
} from '@/hooks/useBilling';
import type { Invoice, InvoiceStatus } from '@/types/billing';

const STATUS_CFG: Record<InvoiceStatus, { label: string; color: string; bg: string; next: InvoiceStatus }> = {
  draft: { label: 'Draft', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', next: 'sent' },
  sent:  { label: 'Sent',  color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  next: 'paid' },
  paid:  { label: 'Paid',  color: '#34d399', bg: 'rgba(16,185,129,0.12)',  next: 'draft' },
};

// ── Invoice row ───────────────────────────────────────────────────────────────

function InvoiceRow({ invoice, onDelete }: { invoice: Invoice; onDelete: (id: string) => void }) {
  const updateStatus = useUpdateInvoiceStatus();
  const [downloading, setDownloading] = useState(false);
  const [expanded,    setExpanded]    = useState(false);

  const st        = STATUS_CFG[invoice.status] ?? STATUS_CFG.draft;
  const isHourly  = invoice.line_items.some(li => li.minutes != null);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.id, invoice.invoice_number);
    } finally {
      setDownloading(false);
    }
  }

  function cycleStatus(e: React.MouseEvent) {
    e.stopPropagation();
    updateStatus.mutate({ id: invoice.id, status: st.next });
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 130px 1fr 180px 100px 90px 80px',
          padding: '11px 16px', alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onClick={() => setExpanded(v => !v)}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Expand chevron */}
        <ChevronDown
          size={13}
          style={{ color: 'var(--text-4)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        />

        {/* Invoice # */}
        <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>
          {invoice.invoice_number}
        </span>

        {/* Org */}
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{invoice.org_name}</span>

        {/* Period */}
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {invoice.period_from} → {invoice.period_to}
        </span>

        {/* Total */}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
          {invoice.currency} {parseFloat(invoice.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>

        {/* Status — click to cycle */}
        <div onClick={cycleStatus}>
          <span
            style={{
              fontSize: 11, fontWeight: 600, color: st.color, background: st.bg,
              padding: '2px 8px', cursor: 'pointer', display: 'inline-block',
              border: `1px solid ${st.color}30`,
            }}
            title="Click to change status"
          >
            {st.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleDownload}
            disabled={downloading}
            title="Download PDF"
            style={{
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--border-md)', cursor: 'pointer', color: 'var(--text-3)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; (e.currentTarget as HTMLElement).style.borderColor = '#60a5fa'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
          >
            {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          </button>
          <button
            onClick={() => onDelete(invoice.id)}
            title="Delete invoice"
            style={{
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--border-md)', cursor: 'pointer', color: 'var(--text-3)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.borderColor = '#f87171'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Expanded line items */}
      {expanded && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)', padding: '0 16px 12px 16px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-md)' }}>
                  {isHourly
                    ? ['Date', 'Agent', 'Description', 'Duration', `Rate (${invoice.currency})`, `Amount (${invoice.currency})`].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))
                    : ['Ticket', 'Subject', 'Level', `Rate (${invoice.currency})`, `Amount (${invoice.currency})`].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map(li => (
                  <tr key={li.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {isHourly ? (
                      <>
                        <td style={{ padding: '6px 10px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{li.log_date ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-2)' }}>{li.agent_name || '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-2)', maxWidth: 260 }}><span className="block truncate">{li.description}</span></td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {li.minutes != null ? (li.minutes < 60 ? `${li.minutes}m` : `${Math.floor(li.minutes/60)}h ${li.minutes%60}m`) : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{parseFloat(li.unit_rate).toFixed(2)}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-1)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{parseFloat(li.amount).toFixed(2)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '6px 10px', color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{li.ticket_ref || '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-2)', maxWidth: 280 }}><span className="block truncate">{li.ticket_subject || li.description}</span></td>
                        <td style={{ padding: '6px 10px' }}>
                          {li.ticket_level
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: li.ticket_level === 'L3' ? '#f87171' : li.ticket_level === 'L2' ? '#a78bfa' : '#60a5fa', background: (li.ticket_level === 'L3' ? '#f87171' : li.ticket_level === 'L2' ? '#a78bfa' : '#60a5fa') + '18', padding: '1px 6px' }}>{li.ticket_level}</span>
                            : <span style={{ color: 'var(--text-5)' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{parseFloat(li.unit_rate).toFixed(2)}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-1)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{parseFloat(li.amount).toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals summary */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 24 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Subtotal: <strong style={{ color: 'var(--text-1)' }}>{invoice.currency} {parseFloat(invoice.subtotal).toFixed(2)}</strong>
            </span>
            {parseFloat(invoice.tax_rate) > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Tax ({invoice.tax_rate}%): <strong style={{ color: 'var(--text-1)' }}>{invoice.currency} {parseFloat(invoice.tax_amount).toFixed(2)}</strong>
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>
              Total: {invoice.currency} {parseFloat(invoice.total).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingInvoicesPage() {
  const router = useRouter();
  const { data: orgRates = []  } = useOrgRates();
  const { data: invoices = [], isLoading } = useInvoices();
  const createInvoice = useCreateInvoice();
  const deleteInvoice = useDeleteInvoice();

  const configuredOrgs = orgRates.filter(e => e.rate);

  const [orgId,      setOrgId]      = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [taxRate,    setTaxRate]    = useState('');
  const [genError,   setGenError]   = useState('');
  const [deleteId,   setDeleteId]   = useState<string | null>(null);

  function handleGenerate() {
    setGenError('');
    if (!orgId)    { setGenError('Select an organization.'); return; }
    if (!dateFrom) { setGenError('Select a start date.'); return; }
    if (!dateTo)   { setGenError('Select an end date.'); return; }
    if (dateFrom > dateTo) { setGenError('Start date must be before end date.'); return; }

    createInvoice.mutate(
      { org_id: orgId, period_from: dateFrom, period_to: dateTo, tax_rate: taxRate || '0' },
      {
        onSuccess: () => {
          setOrgId(''); setDateFrom(''); setDateTo(''); setTaxRate('');
        },
        onError: (e: unknown) => setGenError(e instanceof Error ? e.message : 'Failed to generate invoice.'),
      },
    );
  }

  const inputStyle: React.CSSProperties = {
    height: 32, padding: '0 10px', fontSize: 12,
    background: 'var(--bg-base)', border: '1px solid var(--border-md)',
    color: 'var(--text-1)', outline: 'none',
  };
  const focusIn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#2563eb'; };
  const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-md)'; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => router.push('/settings')}
          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
        >
          <ArrowLeft size={14} />
        </button>
        <Building2 size={14} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Invoices</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 2 }}>— generate & track client invoices</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>

        {/* Generate card */}
        <div style={{ maxWidth: 860, margin: '0 auto', marginBottom: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={13} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Generate Invoice</span>
            </div>

            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>

                {/* Org */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Organization</label>
                  <select
                    value={orgId}
                    onChange={e => { setOrgId(e.target.value); setGenError(''); }}
                    style={{ ...inputStyle, minWidth: 200, cursor: 'pointer' }}
                    onFocus={focusIn} onBlur={focusOut}
                  >
                    <option value="">— Select org —</option>
                    {configuredOrgs.map(e => (
                      <option key={e.org_id} value={e.org_id}>{e.org_name}</option>
                    ))}
                  </select>
                  {configuredOrgs.length === 0 && (
                    <span style={{ fontSize: 10, color: '#f59e0b' }}>Configure rates first →</span>
                  )}
                </div>

                {/* From */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setGenError(''); }}
                    style={inputStyle}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>

                {/* To */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setGenError(''); }}
                    style={inputStyle}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>

                {/* Tax rate */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 90 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Tax %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxRate}
                    onChange={e => setTaxRate(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>

                {/* Button */}
                <button
                  className="btn-primary gap-1.5"
                  style={{ height: 32, fontSize: 12, paddingLeft: 16, paddingRight: 16, flexShrink: 0 }}
                  onClick={handleGenerate}
                  disabled={createInvoice.isPending}
                >
                  {createInvoice.isPending
                    ? <><Loader2 size={11} className="animate-spin" /> Generating…</>
                    : <><Receipt size={11} /> Generate</>
                  }
                </button>
              </div>

              {genError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: '#f87171' }}>
                  <AlertCircle size={12} />
                  {genError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invoices table */}
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin" style={{ color: '#2563eb' }} />
            </div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', border: '1px solid var(--border-md)', background: 'var(--bg-card)', color: 'var(--text-4)', fontSize: 13 }}>
              <FileText size={28} style={{ margin: '0 auto 10px', color: 'var(--border-md)', display: 'block' }} />
              No invoices yet. Generate your first invoice above.
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '28px 130px 1fr 180px 100px 90px 80px',
                padding: '9px 16px', borderBottom: '1px solid var(--border-md)',
                background: 'var(--bg-surface)',
              }}>
                <span />
                {['Invoice #', 'Organization', 'Period', 'Total', 'Status', ''].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>

              {invoices.map(inv => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  onDelete={id => setDeleteId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteId(null)}
        >
          <div
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: 340, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>Delete Invoice?</div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently delete the invoice and all its line items. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                style={{ flex: 1, height: 32, fontSize: 12, background: '#dc2626', borderColor: '#dc2626' }}
                onClick={() => {
                  deleteInvoice.mutate(deleteId!, { onSuccess: () => setDeleteId(null) });
                }}
                disabled={deleteInvoice.isPending}
              >
                {deleteInvoice.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                className="btn-secondary"
                style={{ flex: 1, height: 32, fontSize: 12 }}
                onClick={() => setDeleteId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
