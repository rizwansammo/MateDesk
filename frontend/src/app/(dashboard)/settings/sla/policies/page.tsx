'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Shield, Plus, Pencil, Trash2, Loader2, X,
  Check, AlertCircle, Lock, Mail, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  useSLAPolicies, useCreateSLAPolicy, useUpdateSLAPolicy, useDeleteSLAPolicy,
} from '@/hooks/useSLA';
import { useOrganizations } from '@/hooks/useOrganizations';
import type { SLAPolicy, SLATarget, ScopeType } from '@/types/sla';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(minutes: number): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  if (h < 24) return h % 1 === 0 ? `${h} hr` : `${h.toFixed(1)} hr`;
  const d = h / 24;
  return d % 1 === 0 ? `${d} day${d !== 1 ? 's' : ''}` : `${d.toFixed(1)} days`;
}

const PRIORITIES: Array<{ key: 'critical' | 'high' | 'normal' | 'low'; color: string; bg: string }> = [
  { key: 'critical', color: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)' },
  { key: 'high',     color: 'var(--accent-orange-fg)', bg: 'var(--accent-orange-bg)'  },
  { key: 'normal',   color: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)'  },
  { key: 'low',      color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' },
];

const DEFAULT_TARGETS: Record<string, { first_response_minutes: number; resolution_minutes: number; due_soon_minutes: number }> = {
  critical: { first_response_minutes: 15,   resolution_minutes: 240,  due_soon_minutes: 30   },
  high:     { first_response_minutes: 60,   resolution_minutes: 480,  due_soon_minutes: 60   },
  normal:   { first_response_minutes: 240,  resolution_minutes: 2880, due_soon_minutes: 240  },
  low:      { first_response_minutes: 1440, resolution_minutes: 7200, due_soon_minutes: 1440 },
};

type TargetsMap = typeof DEFAULT_TARGETS;

function toTargetsList(map: TargetsMap): Omit<SLATarget, 'id'>[] {
  return PRIORITIES.map(p => ({ priority: p.key, ...map[p.key] }));
}

function toTargetsMap(targets: SLATarget[]): TargetsMap {
  const map = { ...DEFAULT_TARGETS };
  for (const t of targets) {
    if (map[t.priority]) map[t.priority] = { ...t };
  }
  return map;
}

// ── Policy panel ──────────────────────────────────────────────────────────────

interface PanelProps {
  editing:   SLAPolicy | null;
  onClose:   () => void;
}

function PolicyPanel({ editing, onClose }: PanelProps) {
  const { data: orgs = [] } = useOrganizations();
  const create = useCreateSLAPolicy();
  const update = useUpdateSLAPolicy();

  const [name,    setName]    = useState(editing?.name           ?? '');
  const [desc,    setDesc]    = useState(editing?.description    ?? '');
  const [active,  setActive]  = useState(editing?.is_active      ?? true);
  const [order,   setOrder]   = useState(editing?.priority_order ?? 10);
  const [scope,   setScope]   = useState<ScopeType>(editing?.scope_type ?? 'all_orgs');
  const [orgId,   setOrgId]   = useState(editing?.scope_org ?? '');
  const [emails,  setEmails]  = useState<string[]>(editing?.breach_emails ?? []);
  const [newEmail, setNewEmail] = useState('');
  const [targets, setTargets] = useState<TargetsMap>(editing ? toTargetsMap(editing.targets) : DEFAULT_TARGETS);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);

  const isPending = create.isPending || update.isPending;

  function addEmail() {
    const e = newEmail.trim().toLowerCase();
    if (!e || emails.includes(e)) return;
    setEmails(v => [...v, e]);
    setNewEmail('');
  }

  function setTarget(priority: string, field: string, value: number) {
    setTargets(prev => ({ ...prev, [priority]: { ...prev[priority], [field]: value } }));
  }

  function handleSave() {
    if (!name.trim()) { setError('Policy name is required.'); return; }
    if (scope === 'specific_org' && !orgId) { setError('Select an organization for Specific Org scope.'); return; }
    setError('');

    const payload = {
      name: name.trim(),
      description: desc.trim(),
      is_active: active,
      priority_order: order,
      scope_type: scope,
      scope_org: scope === 'specific_org' ? orgId || null : null,
      breach_emails: emails,
      targets: toTargetsList(targets),
    };

    const opts = {
      onSuccess: () => { setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 600); },
      onError:   () => setError('Failed to save policy.'),
    };

    if (editing) {
      update.mutate({ id: editing.id, data: payload }, opts);
    } else {
      create.mutate(payload, opts);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 12,
    background: 'var(--bg-base)', border: '1px solid var(--border-md)',
    color: 'var(--text-1)', outline: 'none',
  };
  const fi = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#2563eb'; };
  const fo = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-md)'; };

  const sectionHdr = (title: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
      {title}
    </div>
  );

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 700, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-md)',
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{editing ? 'Edit SLA Policy' : 'New SLA Policy'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>Configure response targets and breach rules</div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── Basic Info ── */}
          <div style={{ marginBottom: 24 }}>
            {sectionHdr('Basic Info')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Policy Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Default SLA" style={inp} onFocus={fi} onBlur={fo} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Priority Order</label>
                <input type="number" min={1} max={999} value={order} onChange={e => setOrder(Number(e.target.value))} style={inp} onFocus={fi} onBlur={fo} />
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>Lower = higher priority</p>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Optional description…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} onFocus={fi} onBlur={fo} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Active</span>
              <button
                type="button"
                onClick={() => setActive(v => !v)}
                style={{ width: 40, height: 22, background: active ? '#2563eb' : 'var(--border-md)', position: 'relative', transition: 'background 0.15s', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 3, left: active ? 21 : 3, width: 16, height: 16, background: '#fff', transition: 'left 0.15s' }} />
              </button>
            </div>
          </div>

          {/* ── Scope ── */}
          <div style={{ marginBottom: 24 }}>
            {sectionHdr('Scope — Applies To')}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {([
                { key: 'all_orgs',     label: 'All Organizations', locked: false },
                { key: 'specific_org', label: 'Specific Org',      locked: false },
                { key: 'after_hours',  label: 'After Hours',       locked: true  },
              ] as { key: ScopeType; label: string; locked: boolean }[]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { if (!opt.locked) setScope(opt.key); }}
                  disabled={opt.locked}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500, cursor: opt.locked ? 'not-allowed' : 'pointer',
                    background: scope === opt.key ? 'rgba(37,99,235,0.15)' : 'transparent',
                    border: scope === opt.key ? '1px solid rgba(37,99,235,0.4)' : '1px solid var(--border-md)',
                    color: opt.locked ? 'var(--text-3)' : scope === opt.key ? '#60a5fa' : 'var(--text-3)',
                    opacity: opt.locked ? 0.5 : 1,
                  }}
                >
                  {opt.locked && <Lock size={10} />}
                  {opt.label}
                  {opt.locked && <span style={{ fontSize: 9, color: 'var(--accent-warn-fg)', background: 'rgba(245,158,11,0.15)', padding: '1px 4px', marginLeft: 2 }}>Phase B</span>}
                </button>
              ))}
            </div>
            {scope === 'specific_org' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Organization</label>
                <select value={orgId} onChange={e => setOrgId(e.target.value)} style={{ ...inp, cursor: 'pointer' }} onFocus={fi} onBlur={fo}>
                  <option value="">— Select organization —</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* ── SLA Targets ── */}
          <div style={{ marginBottom: 24 }}>
            {sectionHdr('SLA Targets')}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-md)' }}>
                    <th style={{ width: 90,  padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priority</th>
                    <th style={{ width: 180, padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>First Response</th>
                    <th style={{ width: 180, padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Resolution Time</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Due Soon Warning</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORITIES.map(p => (
                    <tr key={p.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: p.color, background: p.bg, padding: '2px 8px', textTransform: 'capitalize' }}>
                          {p.key}
                        </span>
                      </td>
                      {(['first_response_minutes', 'resolution_minutes', 'due_soon_minutes'] as const).map(field => (
                        <td key={field} style={{ padding: '10px 10px' }}>
                          <input
                            type="number"
                            min={1}
                            value={targets[p.key][field]}
                            onChange={e => setTarget(p.key, field, Number(e.target.value))}
                            style={{ width: 80, padding: '5px 8px', fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', outline: 'none' }}
                            onFocus={fi} onBlur={fo}
                          />
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-4)' }}>
                            = {fmt(targets[p.key][field])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>All values in minutes. First Response and Resolution are measured from ticket creation.</p>
          </div>

          {/* ── Breach Emails ── */}
          <div style={{ marginBottom: 24 }}>
            {sectionHdr('Breach Notifications')}
            <p style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 10 }}>Emails sent when a ticket breaches any SLA target.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {emails.map(email => (
                <div key={email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Mail size={11} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{email}</span>
                  </div>
                  <button onClick={() => setEmails(v => v.filter(e => e !== email))}
                    style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                placeholder="manager@company.com"
                style={{ ...inp, flex: 1 }}
                onFocus={fi} onBlur={fo}
              />
              <button
                onClick={addEmail}
                style={{ height: 34, padding: '0 14px', fontSize: 12, fontWeight: 600, background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-2)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* ── Clock Rules ── */}
          <div style={{ marginBottom: 24 }}>
            {sectionHdr('Clock Rules')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)' }}>
                <div style={{ width: 8, height: 8, background: '#2563eb', borderRadius: '50%', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-1)' }}>Real elapsed time</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-ok-fg)', background: 'rgba(16,185,129,0.12)', padding: '1px 6px' }}>Active</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', opacity: 0.5 }}>
                <Lock size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-4)' }}>Business hours only</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-warn-fg)', background: 'rgba(245,158,11,0.12)', padding: '1px 6px' }}>Phase B — requires Business Hours setup</span>
              </div>
            </div>
          </div>

          {/* ── Pause Rules ── */}
          <div style={{ marginBottom: 8 }}>
            {sectionHdr('Pause Rules')}
            <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Lock size={11} style={{ color: 'var(--text-3)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Pause SLA when ticket is:</span>
                <span style={{ fontSize: 10, color: 'var(--accent-warn-fg)', background: 'rgba(245,158,11,0.12)', padding: '1px 6px', marginLeft: 'auto' }}>Phase B</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Waiting on Customer', 'On Hold'].map(s => (
                  <span key={s} style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '2px 8px' }}>{s}</span>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>SLA clock pauses when status changes to these, resumes when customer replies or status changes back.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: '1px solid var(--border-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-danger-fg)' }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary gap-1.5"
              style={{ flex: 1, height: 34, fontSize: 12 }}
              onClick={handleSave}
              disabled={isPending || saved}
            >
              {isPending ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                : saved   ? <><Check size={11} /> Saved</>
                : <><Check size={11} /> Save Policy</>}
            </button>
            <button className="btn-secondary" style={{ height: 34, fontSize: 12, paddingLeft: 16, paddingRight: 16 }} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SLAPoliciesPage() {
  const router = useRouter();
  const { data: policies = [], isLoading } = useSLAPolicies();
  const deleteMut = useDeleteSLAPolicy();

  const [panel,     setPanel]     = useState<SLAPolicy | null | 'new'>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const SCOPE_LABELS: Record<string, string> = {
    all_orgs:     'All Organizations',
    specific_org: 'Specific Org',
    after_hours:  'After Hours',
  };

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
        <Shield size={14} style={{ color: 'var(--accent-warn-fg)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>SLA Policies</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 2 }}>— response & resolution targets</span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn-primary gap-1"
            style={{ height: 30, fontSize: 12, paddingLeft: 14, paddingRight: 14 }}
            onClick={() => setPanel('new')}
          >
            <Plus size={12} /> New Policy
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
          </div>
        ) : policies.length === 0 ? (
          <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: '60px 0' }}>
            <Shield size={32} style={{ color: 'var(--border-md)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 16 }}>No SLA policies yet.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn-primary gap-1" style={{ fontSize: 12 }} onClick={() => setPanel('new')}>
                <Plus size={12} /> Create First Policy
              </button>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <p style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 16 }}>
              Policies are evaluated in priority order (lowest number wins). The first matching policy applies to each ticket.
            </p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 160px 90px 60px 100px 80px', padding: '9px 16px', borderBottom: '1px solid var(--border-md)', background: 'var(--bg-surface)' }}>
                <span />
                {['Policy Name', 'Scope', 'Active', 'Order', 'Updated', ''].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>

              {policies.map((policy, i) => {
                const isLast     = i === policies.length - 1;
                const isExpanded = expandedId === policy.id;
                return (
                  <div key={policy.id} style={{ borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--border-subtle)' }}>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '28px 1fr 160px 90px 60px 100px 80px', padding: '11px 16px', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                      onClick={() => setExpandedId(isExpanded ? null : policy.id)}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <div>
                        {isExpanded
                          ? <ChevronUp size={12} style={{ color: 'var(--text-4)' }} />
                          : <ChevronDown size={12} style={{ color: 'var(--text-4)' }} />}
                      </div>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{policy.name}</span>
                        {policy.description && (
                          <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{policy.description}</p>
                        )}
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--accent-info-fg)', background: 'rgba(96,165,250,0.1)', padding: '2px 8px' }}>
                          {policy.scope_type === 'specific_org' && policy.scope_org_name
                            ? policy.scope_org_name
                            : SCOPE_LABELS[policy.scope_type]}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: policy.is_active ? '#34d399' : '#94a3b8', background: policy.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)', padding: '2px 8px' }}>
                          {policy.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>{policy.priority_order}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {new Date(policy.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setPanel(policy)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border-md)', color: 'var(--text-3)', cursor: 'pointer' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <Pencil size={10} /> Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(policy.id)}
                          style={{ display: 'flex', alignItems: 'center', width: 26, height: 26, justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-md)', color: 'var(--text-4)', cursor: 'pointer' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.borderColor = '#f87171'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded: targets table */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 14px 44px', background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-md)' }}>
                              {['Priority', 'First Response', 'Resolution', 'Due Soon Warning'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {PRIORITIES.map(p => {
                              const t = policy.targets.find(x => x.priority === p.key);
                              if (!t) return null;
                              return (
                                <tr key={p.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: p.color, background: p.bg, padding: '2px 8px', textTransform: 'capitalize' }}>{p.key}</span>
                                  </td>
                                  <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{fmt(t.first_response_minutes)}</td>
                                  <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{fmt(t.resolution_minutes)}</td>
                                  <td style={{ padding: '7px 10px', color: 'var(--text-4)' }}>{fmt(t.due_soon_minutes)} before</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {policy.breach_emails.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Mail size={11} style={{ color: 'var(--text-4)' }} />
                            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Breach alerts: </span>
                            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{policy.breach_emails.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Policy panel */}
      {panel !== null && (
        <PolicyPanel
          editing={panel === 'new' ? null : panel}
          onClose={() => setPanel(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteId(null)}
        >
          <div
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: 340, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>Delete SLA Policy?</div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
              This policy and all its targets will be permanently deleted. Existing tickets will show &ldquo;Not Applied&rdquo; until another policy matches.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                style={{ flex: 1, height: 32, fontSize: 12, background: '#dc2626', borderColor: '#dc2626' }}
                onClick={() => deleteMut.mutate(deleteId!, { onSuccess: () => setDeleteId(null) })}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn-secondary" style={{ flex: 1, height: 32, fontSize: 12 }} onClick={() => setDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
