'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Pencil, Loader2, Check, X, Clock, Tag } from 'lucide-react';
import { useOrgRates, useUpdateOrgRate } from '@/hooks/useBilling';
import type { OrgRateEntry, RateMode } from '@/types/billing';

const CURRENCIES = ['USD','GBP','EUR','CAD','AUD','NZD','SGD','AED','INR','PKR'];

const STATUS_CFG = {
  hourly:     { label: 'By Hour',   color: 'var(--accent-indigo-fg)', bg: 'var(--accent-indigo-bg)' },
  per_ticket: { label: 'By Ticket', color: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
  not_set:    { label: 'Not Set',   color: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
};

// ── Rate Editor Panel ─────────────────────────────────────────────────────────

function RatePanel({ entry, onClose }: { entry: OrgRateEntry; onClose: () => void }) {
  const existing = entry.rate;
  const [mode,    setMode]    = useState<RateMode>(existing?.mode ?? 'per_ticket');
  const [cur,     setCur]     = useState(existing?.currency ?? 'USD');
  const [hourly,  setHourly]  = useState(existing?.hourly_rate ?? '');
  const [l1,      setL1]      = useState(existing?.l1_rate ?? '');
  const [l2,      setL2]      = useState(existing?.l2_rate ?? '');
  const [l3,      setL3]      = useState(existing?.l3_rate ?? '');
  const [saved,   setSaved]   = useState(false);

  const update = useUpdateOrgRate(entry.org_id);

  function handleSave() {
    const payload = mode === 'hourly'
      ? { mode, currency: cur, hourly_rate: hourly || null, l1_rate: null, l2_rate: null, l3_rate: null }
      : { mode, currency: cur, hourly_rate: null, l1_rate: l1 || null, l2_rate: l2 || null, l3_rate: l3 || null };

    update.mutate(payload, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => { setSaved(false); onClose(); }, 800);
      },
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    background: 'var(--bg-base)', border: '1px solid var(--border-md)',
    color: 'var(--text-1)', outline: 'none',
  };
  const focusIn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#2563eb'; };
  const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-md)'; };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 360, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-md)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
      }}>

        {/* Panel header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{entry.org_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>Billing Rate Configuration</div>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Mode toggle */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Billing Mode</div>
            <div style={{ display: 'flex', border: '1px solid var(--border-md)' }}>
              {(['per_ticket', 'hourly'] as RateMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, height: 36, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: mode === m ? 'rgba(37,99,235,0.15)' : 'transparent',
                    border: 'none',
                    borderRight: m === 'per_ticket' ? '1px solid var(--border-md)' : 'none',
                    color: mode === m ? '#60a5fa' : 'var(--text-3)',
                  }}
                >
                  {m === 'per_ticket' ? <Tag size={12} /> : <Clock size={12} />}
                  {m === 'per_ticket' ? 'By Ticket' : 'By Hour'}
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Currency</div>
            <select
              value={cur}
              onChange={e => setCur(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              onFocus={focusIn}
              onBlur={focusOut}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Rate fields */}
          {mode === 'hourly' ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                Hourly Rate <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({cur})</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={hourly}
                onChange={e => setHourly(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
                onFocus={focusIn}
                onBlur={focusOut}
              />
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
                Charged per hour based on time logs recorded on each ticket.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                Rates per Ticket Level <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({cur})</span>
              </div>
              {([['l1', l1, setL1, '#60a5fa'], ['l2', l2, setL2, '#a78bfa'], ['l3', l3, setL3, '#f87171']] as [string, string, (v: string) => void, string][]).map(([lvl, val, setter, col]) => (
                <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: col, background: col + '18',
                    border: `1px solid ${col}30`, flexShrink: 0,
                  }}>
                    {lvl.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={val}
                    onChange={e => setter(e.target.value)}
                    placeholder="0.00"
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={focusIn}
                    onBlur={focusOut}
                  />
                </div>
              ))}
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Applied to solved / closed tickets in the invoice period.
              </p>
            </div>
          )}
        </div>

        {/* Panel footer */}
        <div style={{ flexShrink: 0, padding: '14px 18px', borderTop: '1px solid var(--border-md)', display: 'flex', gap: 8 }}>
          <button
            className="btn-primary gap-1.5"
            style={{ flex: 1, height: 34, fontSize: 12 }}
            onClick={handleSave}
            disabled={update.isPending || saved}
          >
            {update.isPending
              ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
              : saved
                ? <><Check size={11} /> Saved</>
                : <><Check size={11} /> Save Rate</>
            }
          </button>
          <button
            className="btn-secondary"
            style={{ height: 34, fontSize: 12, paddingLeft: 14, paddingRight: 14 }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingRatesPage() {
  const router = useRouter();
  const { data: entries = [], isLoading } = useOrgRates();
  const [editing, setEditing] = useState<OrgRateEntry | null>(null);

  const configured = entries.filter(e => e.rate).length;
  const total      = entries.length;

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
        <Building2 size={14} style={{ color: 'var(--accent-warn-fg)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Client Rates</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 2 }}>— billing rate per organization</span>
        {!isLoading && total > 0 && (
          <span style={{ marginLeft: 4, fontSize: 11, color: configured === total ? '#34d399' : '#f59e0b', background: configured === total ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', padding: '1px 8px', border: `1px solid ${configured === total ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
            {configured}/{total} configured
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-4)', fontSize: 13 }}>
            No client organizations found. Add organizations in Settings → Clients first.
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.6 }}>
              Configure a billing rate for each client organization. Invoices use these rates to calculate charges.
            </p>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 110px 80px',
                padding: '9px 16px', borderBottom: '1px solid var(--border-md)',
                background: 'var(--bg-surface)',
              }}>
                {['Organization', 'Mode', 'Currency', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              {entries.map((entry, i) => {
                const isLast = i === entries.length - 1;
                const st     = entry.rate
                  ? STATUS_CFG[entry.rate.mode]
                  : STATUS_CFG.not_set;

                return (
                  <div
                    key={entry.org_id}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 120px 110px 80px',
                      padding: '11px 16px', alignItems: 'center',
                      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                      {entry.org_name}
                    </div>

                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px' }}>
                        {st.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: entry.rate ? 'var(--text-2)' : 'var(--text-3)' }}>
                      {entry.rate ? entry.rate.currency : '—'}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setEditing(entry)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          height: 26, padding: '0 10px', fontSize: 11, fontWeight: 500,
                          background: 'transparent', border: '1px solid var(--border-md)',
                          color: 'var(--text-3)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                        }}
                      >
                        <Pencil size={10} />
                        {entry.rate ? 'Edit' : 'Set Rate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Slide-in rate editor */}
      {editing && (
        <RatePanel
          entry={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
