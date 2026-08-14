'use client';

import { use, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Globe, Mail, Phone, MapPin,
  Users, AlertCircle, Loader2, CheckCircle, Plus, X, Check, Trash2, AtSign, Clock, Save,
  KeyRound, Copy, CheckCheck,
} from 'lucide-react';
import { useOrganization, useOrgUsers, useCreateOrgUser, useUpdateOrganization, useResetPassword, type CreateOrgUserPayload, type BusinessHours, type BusinessHoursDay } from '@/hooks/useOrganizations';
import { useSenders, useDeleteSender } from '@/hooks/useSenders';
import { useAuthStore } from '@/store/useAuthStore';
import { TIMEZONES, getTzAbbr } from '@/lib/timezones';

const ROLE_LABELS: Record<string, string> = {
  msp_owner: 'MSP Owner', msp_manager: 'MSP Manager', msp_agent: 'MSP Agent',
  client_owner: 'Client Owner', end_user: 'End User',
};

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
function avatarColor(name: string) {
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-elevated)', padding: '16px 24px', minWidth: 110 }}
    >
      <span style={{ fontSize: 26, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'center' }}>{label}</span>
    </div>
  );
}

const DAYS: Array<{ key: keyof BusinessHours; label: string }> = [
  { key: 'monday',    label: 'Monday'    },
  { key: 'tuesday',   label: 'Tuesday'   },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday'  },
  { key: 'friday',    label: 'Friday'    },
  { key: 'saturday',  label: 'Saturday'  },
  { key: 'sunday',    label: 'Sunday'    },
];

const DEFAULT_DAY: BusinessHoursDay = { enabled: false, start_time: '09:00', end_time: '17:00' };

function buildDefaultBH(): BusinessHours {
  return {
    monday: { enabled: true, start_time: '09:00', end_time: '17:00' },
    tuesday: { enabled: true, start_time: '09:00', end_time: '17:00' },
    wednesday: { enabled: true, start_time: '09:00', end_time: '17:00' },
    thursday: { enabled: true, start_time: '09:00', end_time: '17:00' },
    friday: { enabled: true, start_time: '09:00', end_time: '17:00' },
    saturday: DEFAULT_DAY,
    sunday: DEFAULT_DAY,
  };
}

const EMPTY_FORM: CreateOrgUserPayload = {
  first_name: '', last_name: '', email: '', role: 'end_user',
  job_title: '', department: '', phone: '',
};

const CLIENT_ROLE_OPTIONS = [
  { value: 'end_user',     label: 'End User' },
  { value: 'client_owner', label: 'Client Owner' },
];

export default function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const { user: me } = useAuthStore();
  const isMSP = ['msp_owner', 'msp_manager', 'msp_agent'].includes(me?.role ?? '');

  const { data: org,     isLoading: orgLoading }   = useOrganization(id);
  const { data: users,   isLoading: usersLoading } = useOrgUsers(id);
  const { data: senders, isLoading: sendersLoading } = useSenders(id);
  const createUser   = useCreateOrgUser(id);
  const updateOrg    = useUpdateOrganization();
  const deleteSender = useDeleteSender();
  const [deletingSenderId, setDeletingSenderId] = useState<number | null>(null);
  const resetPassword = useResetPassword();

  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<CreateOrgUserPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  // Credentials popup state (shown after user creation or password reset)
  const [credsPopup, setCredsPopup] = useState<{ email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  // Reset password states
  const [resetUserId, setResetUserId]   = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState('');

  // Business hours local state — seeded from org once loaded
  const [bh,       setBH]       = useState<BusinessHours | null>(null);
  const [bhSaved,  setBHSaved]  = useState(false);
  // Seed BH from org when it loads (only once)
  const bhSeeded = useRef(false);
  useEffect(() => {
    if (!org || bhSeeded.current) return;
    bhSeeded.current = true;
    const existing = org.business_hours as Partial<BusinessHours>;
    const defaults  = buildDefaultBH();
    setBH({
      monday:    existing.monday    ?? defaults.monday,
      tuesday:   existing.tuesday   ?? defaults.tuesday,
      wednesday: existing.wednesday ?? defaults.wednesday,
      thursday:  existing.thursday  ?? defaults.thursday,
      friday:    existing.friday    ?? defaults.friday,
      saturday:  existing.saturday  ?? defaults.saturday,
      sunday:    existing.sunday    ?? defaults.sunday,
    });
  }, [org]);

  // Timezone picker state
  const [tzOpen,   setTzOpen]   = useState(false);
  const [tzSearch, setTzSearch] = useState('');
  const tzRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tzOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tzOpen]);

  const filteredTzs = TIMEZONES.filter(t =>
    t.label.toLowerCase().includes(tzSearch.toLowerCase()) ||
    t.value.toLowerCase().includes(tzSearch.toLowerCase())
  );

  function handleTzSelect(value: string) {
    setTzOpen(false);
    setTzSearch('');
    updateOrg.mutate({ id, data: { timezone: value } });
  }

  function openModal() { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setFormError(''); }

  function handleCreate() {
    setFormError('');
    if (!form.first_name.trim()) { setFormError('First name is required.'); return; }
    if (!form.email.trim())      { setFormError('Email is required.'); return; }
    createUser.mutate(form, {
      onSuccess: (data) => {
        closeModal();
        if (data.generated_password) {
          setCredsPopup({ email: data.email, password: data.generated_password });
        }
      },
      onError: (err: unknown) => {
        const msg = (err instanceof Error ? err.message : null) ?? 'Failed to create user.';
        setFormError(msg);
      },
    });
  }

  function handleCopy(text: string, field: 'email' | 'password') {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleResetPassword() {
    if (!resetUserId) return;
    resetPassword.mutate(resetUserId, {
      onSuccess: (data) => {
        setResetUserId(null);
        setResetUserName('');
        const user = users?.find(u => u.id === resetUserId);
        setCredsPopup({ email: user?.email ?? '', password: data.generated_password });
      },
    });
  }

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={32} style={{ color: 'var(--accent-danger-fg)' }} />
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Organization not found.</p>
        <button onClick={() => router.push('/settings/organizations')} className="btn-primary" style={{ fontSize: 12 }}>
          Back to Organizations
        </button>
      </div>
    );
  }

  const openTickets  = (users ?? []).reduce((s, u) => s + u.open_tickets, 0);
  const totalUsers   = users?.length ?? org.user_count;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings/organizations')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Organizations
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{org.name}</span>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">

        {/* Profile header */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
          <div className="p-5 flex items-start gap-5">
            <div
              className="flex items-center justify-center font-bold text-white flex-shrink-0"
              style={{ width: 64, height: 64, background: avatarColor(org.name), fontSize: 24 }}
            >
              {org.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{org.name}</h1>
                <span className={org.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                  {org.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {org.domain && (
                  <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--accent-info-fg)' }}>
                    <Globe size={12} /> {org.domain}
                  </span>
                )}
                {org.contact_email && (
                  <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    <Mail size={12} /> {org.contact_email}
                  </span>
                )}
                {org.phone && (
                  <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    <Phone size={12} /> {org.phone}
                  </span>
                )}
                {org.address && (
                  <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    <MapPin size={12} /> {org.address}
                  </span>
                )}
              </div>
              {org.contact_name && (
                <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 6 }}>
                  Main contact: <span style={{ color: 'var(--text-2)' }}>{org.contact_name}</span>
                </p>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
              Since {new Date(org.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 px-5 pb-5">
            <StatBadge label="Total Tickets"  value={org.total_tickets} color="#60a5fa" />
            <StatBadge label="Open Tickets"   value={openTickets}       color="#f87171" />
            <StatBadge label="Total Users"    value={totalUsers}        color="#34d399" />
          </div>
        </div>

        {/* Organization Settings — timezone */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
          <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Clock size={13} style={{ color: 'var(--accent-warn-fg)' }} />
            <span className="panel-title">Organization Settings</span>
          </div>

          <div className="flex items-center gap-4 px-5 py-4">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', width: 72, flexShrink: 0 }}>Timezone</span>

            <div ref={tzRef} style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
              {/* Current value button */}
              {isMSP ? (
                <button
                  onClick={() => { setTzOpen(v => !v); setTzSearch(''); }}
                  style={{
                    width: '100%', height: 34, padding: '0 12px',
                    background: 'var(--bg-base)', border: `1px solid ${tzOpen ? '#2563eb' : 'var(--border-md)'}`,
                    color: org.timezone ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: 13, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {org.timezone
                      ? TIMEZONES.find(t => t.value === org.timezone)?.label ?? org.timezone
                      : 'Not set — click to choose'}
                  </span>
                  {org.timezone && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-warn-fg)', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', padding: '1px 6px', flexShrink: 0 }}>
                      {getTzAbbr(org.timezone)}
                    </span>
                  )}
                </button>
              ) : (
                <div style={{ fontSize: 13, color: org.timezone ? 'var(--text-1)' : 'var(--text-3)' }}>
                  {org.timezone
                    ? TIMEZONES.find(t => t.value === org.timezone)?.label ?? org.timezone
                    : '—'}
                  {org.timezone && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--accent-warn-fg)', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', padding: '1px 6px' }}>
                      {getTzAbbr(org.timezone)}
                    </span>
                  )}
                </div>
              )}

              {/* Dropdown */}
              {tzOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.45)', maxHeight: 280, display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search timezone…"
                      value={tzSearch}
                      onChange={e => setTzSearch(e.target.value)}
                      style={{
                        width: '100%', height: 30, padding: '0 10px',
                        background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                        color: 'var(--text-1)', fontSize: 12, outline: 'none',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredTzs.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>No results</div>
                    ) : filteredTzs.map(tz => (
                      <div
                        key={tz.value}
                        onClick={() => handleTzSelect(tz.value)}
                        style={{
                          padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                          color: org.timezone === tz.value ? '#60a5fa' : 'var(--text-1)',
                          background: org.timezone === tz.value ? 'rgba(59,130,246,0.08)' : 'transparent',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = org.timezone === tz.value ? 'rgba(59,130,246,0.08)' : 'transparent'; }}
                      >
                        {tz.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {updateOrg.isPending && (
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-info-fg)', flexShrink: 0 }} />
            )}
          </div>
        </div>

        {/* Users table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <span className="flex items-center gap-2 panel-title">
              <Users size={13} style={{ color: 'var(--accent-info-fg)' }} /> Users
              {users && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-elevated)', padding: '1px 6px' }}>
                  {users.length}
                </span>
              )}
            </span>
            {isMSP && (
              <button
                onClick={openModal}
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', padding: '5px 12px', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d4ed8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2563eb'; }}
              >
                <Plus size={11} /> Create User
              </button>
            )}
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="py-12 text-center" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              No users in this organization yet.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th className="text-right">Total Tickets</th>
                  <th className="text-right">Open</th>
                  <th>Joined</th>
                  <th>Status</th>
                  {isMSP && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex items-center justify-center font-bold text-white flex-shrink-0"
                          style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor(user.full_name), fontSize: 10 }}
                        >
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <Link
                          href={`/settings/organizations/${id}/users/${user.id}`}
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#60a5fa'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
                        >
                          {user.full_name}
                        </Link>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{user.email}</td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--accent-indigo-fg)', background: 'rgba(129,140,248,0.1)', padding: '2px 7px' }}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-4)', fontSize: 12 }}>{user.department || '—'}</td>
                    <td className="text-right" style={{ color: 'var(--accent-info-fg)', fontWeight: 600, fontSize: 13 }}>{user.total_tickets}</td>
                    <td className="text-right" style={{ color: user.open_tickets > 0 ? '#f87171' : 'var(--text-3)', fontSize: 13 }}>{user.open_tickets}</td>
                    <td style={{ color: 'var(--text-4)', fontSize: 12 }}>
                      {new Date(user.date_joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td>
                      <span className="flex items-center gap-1" style={{ fontSize: 11, color: user.is_active ? '#34d399' : '#f87171' }}>
                        <CheckCircle size={11} />
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isMSP && (
                      <td>
                        <button
                          onClick={() => { setResetUserId(user.id); setResetUserName(user.full_name); }}
                          className="flex items-center gap-1.5"
                          style={{ fontSize: 11, color: 'var(--accent-warn-fg)', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,0.15)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,0.08)'; }}
                          title="Reset password"
                        >
                          <KeyRound size={11} />
                          Reset Password
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Known Email Senders */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="flex items-center gap-2 panel-title">
              <AtSign size={13} style={{ color: 'var(--accent-violet-fg)' }} /> Known Email Senders
              {senders && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-elevated)', padding: '1px 6px' }}>
                  {senders.length}
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Email addresses permanently routed to this org
            </span>
          </div>

          {sendersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
            </div>
          ) : !senders || senders.length === 0 ? (
            <div className="py-8 text-center" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              No known senders yet — assign one from the Walk-In tickets list.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email Address</th>
                  <th>Name</th>
                  <th>Added</th>
                  {isMSP && <th />}
                </tr>
              </thead>
              <tbody>
                {senders.map(s => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--accent-violet-fg)', fontSize: 12, fontFamily: 'monospace' }}>{s.email}</td>
                    <td style={{ color: 'var(--text-2)', fontSize: 13 }}>{s.name || '—'}</td>
                    <td style={{ color: 'var(--text-4)', fontSize: 12 }}>
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    {isMSP && (
                      <td>
                        <button
                          onClick={() => setDeletingSenderId(s.id)}
                          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 4px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                          title="Remove rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Business Hours */}
        {isMSP && bh && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                <Clock size={13} style={{ color: '#38bdf8' }} /> Business Hours
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Used by After-Hours SLA scope</span>
            </div>

            <div style={{ padding: '4px 0' }}>
              {DAYS.map(({ key, label }) => {
                const day = bh[key];
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 20px',
                      borderBottom: key === 'sunday' ? 'none' : '1px solid var(--border-subtle)',
                      background: day.enabled ? 'transparent' : 'rgba(0,0,0,0.02)',
                    }}
                  >
                    {/* Toggle */}
                    <button
                      onClick={() => setBH(prev => prev ? { ...prev, [key]: { ...prev[key], enabled: !day.enabled } } : prev)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                    >
                      <div style={{
                        width: 32, height: 18, borderRadius: 9,
                        background: day.enabled ? '#2563eb' : 'var(--bg-elevated)',
                        border: '1px solid ' + (day.enabled ? '#1d4ed8' : 'var(--border-md)'),
                        position: 'relative', transition: 'background 0.15s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 2, left: day.enabled ? 14 : 2,
                          width: 12, height: 12, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                    </button>

                    {/* Day label */}
                    <span style={{ width: 82, fontSize: 12, fontWeight: 600, color: day.enabled ? 'var(--text-2)' : 'var(--text-3)', flexShrink: 0 }}>
                      {label}
                    </span>

                    {day.enabled ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="time"
                          value={day.start_time}
                          onChange={e => setBH(prev => prev ? { ...prev, [key]: { ...prev[key], start_time: e.target.value } } : prev)}
                          style={{ height: 28, padding: '0 8px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>to</span>
                        <input
                          type="time"
                          value={day.end_time}
                          onChange={e => setBH(prev => prev ? { ...prev, [key]: { ...prev[key], end_time: e.target.value } } : prev)}
                          style={{ height: 28, padding: '0 8px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                        />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Closed</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '10px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              {bhSaved && (
                <span style={{ fontSize: 11, color: 'var(--accent-ok-fg)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={11} /> Saved
                </span>
              )}
              <button
                onClick={() => {
                  setBHSaved(false);
                  updateOrg.mutate({ id, data: { business_hours: bh } }, {
                    onSuccess: () => { setBHSaved(true); setTimeout(() => setBHSaved(false), 3000); },
                  });
                }}
                disabled={updateOrg.isPending}
                style={{
                  height: 32, padding: '0 16px', background: '#2563eb', border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: updateOrg.isPending ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!updateOrg.isPending) (e.currentTarget as HTMLElement).style.background = '#1d4ed8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2563eb'; }}
              >
                {updateOrg.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save Business Hours
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── Delete Sender Confirm ─────────────────────────────────────────── */}
      {deletingSenderId !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingSenderId(null); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 380 }}>
            <div style={{ padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Remove Email Rule?</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                This email address will no longer be automatically routed to this organization. Future emails from this sender will go to Walk-In unless a domain rule still matches.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setDeletingSenderId(null)}
                style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteSender.mutate(deletingSenderId!, { onSuccess: () => setDeletingSenderId(null) })}
                disabled={deleteSender.isPending}
                style={{ padding: '6px 16px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {deleteSender.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Remove Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create User Modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border-md)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Create User — {org?.name}</span>
              <button onClick={closeModal} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {formError && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--accent-danger-fg)', fontSize: 12 }}>
                  {formError}
                </div>
              )}

              {/* Name row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['first_name', 'last_name'] as const).map(key => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                      {key === 'first_name' ? 'First Name *' : 'Last Name'}
                    </label>
                    <input
                      type="text"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                ))}
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>

              {/* Role */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                >
                  {CLIENT_ROLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} style={{ background: 'var(--bg-surface)' }}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Job Title / Department */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['job_title', 'department'] as const).map(key => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                      {key === 'job_title' ? 'Job Title' : 'Department'}
                    </label>
                    <input
                      type="text"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                ))}
              </div>

              {/* Phone */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: -4 }}>
                A random password will be generated. You&apos;ll be shown the credentials after creation.
              </p>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-md)' }}>
              <button onClick={closeModal} style={{ padding: '6px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createUser.isPending}
                style={{ padding: '6px 18px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: createUser.isPending ? 0.6 : 1 }}
              >
                {createUser.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Create User
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Credentials Popup (after creation or password reset) ─────────── */}
      {credsPopup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setCredsPopup(null); setCopiedField(null); } }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-md)' }}>
              <span className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                <CheckCircle size={14} style={{ color: 'var(--accent-ok-fg)' }} />
                Account Credentials
              </span>
              <button onClick={() => { setCredsPopup(null); setCopiedField(null); }} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 12, color: 'var(--accent-ok-fg)', lineHeight: 1.5 }}>
                Please copy and save these credentials now. The password will <strong>not</strong> be shown again.
              </div>

              {/* Email field */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Email</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, height: 36, padding: '0 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-1)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden' }}>
                    {credsPopup.email}
                  </div>
                  <button
                    onClick={() => handleCopy(credsPopup.email, 'email')}
                    style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: copiedField === 'email' ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)', border: `1px solid ${copiedField === 'email' ? 'rgba(34,197,94,0.3)' : 'var(--border-md)'}`, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                    title="Copy email"
                  >
                    {copiedField === 'email' ? <CheckCheck size={14} style={{ color: 'var(--accent-ok-fg)' }} /> : <Copy size={14} style={{ color: 'var(--text-3)' }} />}
                  </button>
                </div>
              </div>

              {/* Password field */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Password</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, height: 36, padding: '0 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--accent-warn-fg)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', letterSpacing: '0.05em' }}>
                    {credsPopup.password}
                  </div>
                  <button
                    onClick={() => handleCopy(credsPopup.password, 'password')}
                    style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: copiedField === 'password' ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)', border: `1px solid ${copiedField === 'password' ? 'rgba(34,197,94,0.3)' : 'var(--border-md)'}`, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                    title="Copy password"
                  >
                    {copiedField === 'password' ? <CheckCheck size={14} style={{ color: 'var(--accent-ok-fg)' }} /> : <Copy size={14} style={{ color: 'var(--text-3)' }} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--border-md)' }}>
              <button
                onClick={() => { setCredsPopup(null); setCopiedField(null); }}
                style={{ padding: '6px 18px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d4ed8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2563eb'; }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Confirm Modal ────────────────────────────────── */}
      {resetUserId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setResetUserId(null); setResetUserName(''); } }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={15} style={{ color: 'var(--accent-warn-fg)' }} />
                Reset Password?
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                A new random password will be generated for <strong style={{ color: 'var(--text-1)' }}>{resetUserName}</strong>. The current password will be invalidated.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => { setResetUserId(null); setResetUserName(''); }}
                style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetPassword.isPending}
                style={{ padding: '6px 16px', background: '#fbbf24', border: 'none', color: '#000', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: resetPassword.isPending ? 0.6 : 1 }}
              >
                {resetPassword.isPending ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
