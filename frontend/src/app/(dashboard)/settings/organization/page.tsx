'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Building2, Save, Loader2, CheckCircle,
  Pencil, X, AlertCircle, UserCog,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant, useUpdateTenant } from '@/hooks/useTenant';
import type { TenantDetail } from '@/hooks/useTenant';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Phoenix',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney',
];

type FormState = Pick<TenantDetail, 'name' | 'support_email' | 'phone' | 'address' | 'website' | 'timezone'>;

function tenantToForm(t: TenantDetail): FormState {
  return {
    name:          t.name          ?? '',
    support_email: t.support_email ?? '',
    phone:         t.phone         ?? '',
    address:       t.address       ?? '',
    website:       t.website       ?? '',
    timezone:      t.timezone      ?? 'UTC',
  };
}

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

const lbl = 'block mb-1 text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide';
const val = 'text-[13px] text-[var(--text-1)] py-1.5 min-h-[36px] flex items-center';
const inp = 'w-full h-9 px-3 text-[13px] bg-[var(--bg-base)] border border-[var(--border-md)] text-[var(--text-1)] placeholder-[#3d4a6b] outline-none focus:border-[#2563eb] transition-colors';

export default function OrganizationDetailsPage() {
  const router    = useRouter();
  const currentUser = useAuthStore(s => s.user);
  const isOwner   = currentUser?.role === 'msp_owner';

  const { data: tenant, isLoading } = useTenant();
  const updateTenant = useUpdateTenant();

  const [isEditing, setIsEditing]   = useState(false);
  const [form,  setForm]            = useState<FormState>({ name: '', support_email: '', phone: '', address: '', website: '', timezone: 'UTC' });
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');

  // Transfer ownership state
  const [showTransfer,   setShowTransfer]   = useState(false);
  const [newOwnerId,     setNewOwnerId]     = useState('');
  const [transferError,  setTransferError]  = useState('');
  const [transferDone,   setTransferDone]   = useState(false);
  const [transferBusy,   setTransferBusy]   = useState(false);

  const qc = useQueryClient();

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['staff-list'],
    queryFn:  () => apiFetch<StaffMember[]>('/api/agents/'),
    enabled:  isOwner,
  });

  const transferCandidates = staffList.filter(
    s => s.id !== currentUser?.id && s.role !== 'msp_owner'
  );

  useEffect(() => {
    if (tenant) setForm(tenantToForm(tenant));
  }, [tenant]);

  function handleEdit() {
    if (tenant) setForm(tenantToForm(tenant));
    setError('');
    setSaved(false);
    setIsEditing(true);
  }

  function handleCancel() {
    if (tenant) setForm(tenantToForm(tenant));
    setError('');
    setIsEditing(false);
  }

  function handleSave() {
    setError('');
    const payload: Partial<TenantDetail> = {
      support_email: form.support_email,
      phone:         form.phone,
      address:       form.address,
      website:       form.website,
      timezone:      form.timezone,
    };
    if (isOwner) payload.name = form.name;

    updateTenant.mutate(payload, {
      onSuccess: () => {
        setSaved(true);
        setIsEditing(false);
        setTimeout(() => setSaved(false), 3000);
      },
      onError: (err: unknown) => {
        const msg = err instanceof ApiError ? err.message : 'Save failed. Please try again.';
        setError(msg);
      },
    });
  }

  async function handleTransfer() {
    if (!newOwnerId) return;
    setTransferError('');
    setTransferBusy(true);
    try {
      await apiFetch('/api/tenant/transfer-ownership/', {
        method: 'POST',
        body: JSON.stringify({ new_owner_id: newOwnerId }),
      });
      setTransferDone(true);
      setShowTransfer(false);
      qc.invalidateQueries({ queryKey: ['staff-list'] });
    } catch (err) {
      setTransferError(err instanceof ApiError ? err.message : 'Transfer failed.');
    } finally {
      setTransferBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Organization Details</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div style={{
                width: 40, height: 40, flexShrink: 0,
                background: 'rgba(37,99,235,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={18} style={{ color: 'var(--accent-info-fg)' }} />
              </div>
              <div>
                <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Organization Details</h1>
                <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                  Your MSP company information and contact details.
                </p>
              </div>
            </div>

            {!isEditing && !isLoading && (
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5"
                style={{
                  height: 32, padding: '0 14px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
                  color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.borderColor = '#2563eb'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '24px 28px' }}>
              <div className="flex flex-col gap-5">

                {/* Organization Name + Slug */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lbl}>Organization Name</label>
                    {isEditing && isOwner
                      ? <input type="text" value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Acme IT Services" className={inp} />
                      : <div className={val} style={{ color: 'var(--text-1)' }}>{tenant?.name || '—'}</div>
                    }
                    {isEditing && !isOwner && (
                      <div className={val} style={{ color: 'var(--text-3)', fontSize: 11 }}>
                        {tenant?.name || '—'} <span style={{ color: 'var(--text-3)' }}>(Owner only)</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>
                      Tenant Slug{' '}
                      <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(read-only)</span>
                    </label>
                    <div className={val} style={{ color: 'var(--text-4)', fontFamily: 'monospace', fontSize: 12 }}>
                      {tenant?.slug || '—'}
                    </div>
                  </div>
                </div>

                {/* Support Email + Phone */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lbl}>Support Email</label>
                    {isEditing
                      ? <input type="email" value={form.support_email}
                          onChange={e => setForm(f => ({ ...f, support_email: e.target.value }))}
                          placeholder="support@yourdomain.com" className={inp} />
                      : <div className={val}>{tenant?.support_email || '—'}</div>
                    }
                  </div>
                  <div>
                    <label className={lbl}>Phone Number</label>
                    {isEditing
                      ? <input type="tel" value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="+1 (555) 000-0000" className={inp} />
                      : <div className={val}>{tenant?.phone || '—'}</div>
                    }
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className={lbl}>Address</label>
                  {isEditing
                    ? <input type="text" value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="123 Main St, City, State" className={inp} />
                    : <div className={val}>{tenant?.address || '—'}</div>
                  }
                </div>

                {/* Website + Timezone */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lbl}>Website</label>
                    {isEditing
                      ? <input type="url" value={form.website}
                          onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                          placeholder="https://yourdomain.com" className={inp} />
                      : <div className={val}>{tenant?.website || '—'}</div>
                    }
                  </div>
                  <div>
                    <label className={lbl}>Timezone</label>
                    {isEditing
                      ? (
                        <select
                          value={form.timezone}
                          onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                          className={inp}
                          style={{ cursor: 'pointer', appearance: 'none' }}
                        >
                          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      )
                      : <div className={val}>{tenant?.timezone || 'UTC'}</div>
                    }
                  </div>
                </div>

                {/* Error banner */}
                {error && (
                  <div className="flex items-center gap-2" style={{
                    padding: '10px 14px', fontSize: 12,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: 'var(--accent-danger-fg)',
                  }}>
                    <AlertCircle size={13} style={{ flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                {/* Edit-mode action row */}
                {isEditing && (
                  <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={handleSave}
                      disabled={updateTenant.isPending}
                      className="flex items-center gap-2 px-5 py-2 font-semibold text-white disabled:opacity-50"
                      style={{ background: '#2563eb', fontSize: 12 }}
                    >
                      {updateTenant.isPending
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Save size={12} />
                      }
                      {updateTenant.isPending ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={updateTenant.isPending}
                      className="flex items-center gap-2 px-4 py-2"
                      style={{
                        fontSize: 12, color: 'var(--text-3)', cursor: 'pointer',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
                      }}
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                )}

                {/* Success banner (view mode) */}
                {saved && !isEditing && (
                  <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--accent-ok-fg)' }}>
                    <CheckCircle size={13} /> Changes saved successfully
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Transfer Ownership — msp_owner only */}
          {isOwner && !isLoading && (
            <div style={{ marginTop: 24, background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '24px 28px' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{ width: 36, height: 36, background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UserCog size={16} style={{ color: 'var(--accent-violet-fg)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Organization Owner</div>
                    <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                      Transfer ownership to another staff member. You will become a Manager.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowTransfer(true); setTransferError(''); setNewOwnerId(''); }}
                  style={{
                    height: 32, padding: '0 14px', flexShrink: 0,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
                    color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#a78bfa'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                >
                  Transfer Ownership
                </button>
              </div>

              {transferDone && (
                <div className="flex items-center gap-1.5 mt-3" style={{ fontSize: 12, color: 'var(--accent-ok-fg)' }}>
                  <CheckCircle size={13} /> Ownership transferred successfully.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Transfer Ownership Modal */}
      {showTransfer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 440, padding: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>Transfer Organization Ownership</div>
            <p style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 20, lineHeight: 1.6 }}>
              Select a staff member to become the new owner. You will be reassigned to Manager.
              This action cannot be undone without their cooperation.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                New Owner
              </label>
              <select
                value={newOwnerId}
                onChange={e => setNewOwnerId(e.target.value)}
                className={inp}
                style={{ cursor: 'pointer' }}
              >
                <option value="">— Select staff member —</option>
                {transferCandidates.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
              {transferCandidates.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>No eligible staff members found.</p>
              )}
            </div>

            {transferError && (
              <div className="flex items-center gap-2 mb-4" style={{ padding: '8px 12px', fontSize: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-danger-fg)' }}>
                <AlertCircle size={12} style={{ flexShrink: 0 }} /> {transferError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowTransfer(false)}
                style={{ height: 32, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={!newOwnerId || transferBusy}
                style={{ height: 32, padding: '0 16px', background: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !newOwnerId || transferBusy ? 0.5 : 1 }}
              >
                {transferBusy ? 'Transferring…' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
