'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, Briefcase, Users, Building2, Clock,
  ShieldCheck, Edit2, X, Save, Loader2, Key, MessageCircle,
} from 'lucide-react';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { useUserProfile, useUpdateUser, useOrganizations } from '@/hooks/useOrganizations';
import { useUserTickets } from '@/hooks/useTickets';
import { useChatStore } from '@/store/useChatStore';
import { useChat } from '@/context/ChatContext';
import { useAuthStore } from '@/store/useAuthStore';

// ── Shared style constants ────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", monospace',
  fontVariantNumeric: 'tabular-nums',
};

const ROLE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  msp_owner:    { label: 'MSP Owner',    color: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)'   },
  msp_manager:  { label: 'MSP Manager',  color: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)'  },
  msp_agent:    { label: 'MSP Agent',    color: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)'  },
  client_owner: { label: 'Client Owner', color: 'var(--accent-violet-fg)', bg: 'var(--accent-violet-bg)'  },
  end_user:     { label: 'End User',     color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' },
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'var(--accent-info-fg)' },
  pending:     { label: 'Pending',     color: 'var(--accent-indigo-fg)' },
  in_progress: { label: 'In Progress', color: 'var(--accent-warn-fg)' },
  solved:      { label: 'Resolved',    color: 'var(--accent-ok-fg)' },
  closed:      { label: 'Closed',      color: 'var(--text-3)' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'var(--accent-ok-fg)' },
  normal:   { label: 'Normal',   color: 'var(--accent-info-fg)' },
  high:     { label: 'High',     color: 'var(--accent-warn-fg)' },
  critical: { label: 'Critical', color: 'var(--accent-danger-fg)' },
};

const MSP_ROLE_OPTIONS = [
  { value: 'msp_owner',   label: 'MSP Owner'   },
  { value: 'msp_manager', label: 'MSP Manager' },
  { value: 'msp_agent',   label: 'MSP Agent'   },
];
const CLIENT_ROLE_OPTIONS = [
  { value: 'client_owner', label: 'Client Owner' },
  { value: 'end_user',     label: 'End User'     },
];

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-md)',
  color: 'var(--text-0)', fontSize: 13, padding: '7px 10px', outline: 'none',
  fontFamily: '"IBM Plex Mono", monospace',
};

const SELECT: React.CSSProperties = { ...INPUT, appearance: 'none', cursor: 'pointer' };

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-md)' }}>
      <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text-0)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
        {title}
      </span>
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {Icon && <Icon size={14} style={{ color: 'var(--text-3)', marginTop: 3, flexShrink: 0 }} />}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ ...MONO, fontSize: 13, fontWeight: 600, color: value ? 'var(--text-0)' : 'var(--text-3)' }}>
          {value || '—'}
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <div style={{ ...MONO, fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  );
}

// ── Edit form type ────────────────────────────────────────────────────────────

interface EditForm {
  first_name:      string;
  last_name:       string;
  email:           string;
  phone:           string;
  job_title:       string;
  department:      string;
  employee_id:     string;
  reports_to:      string;
  business_impact: string;
  role:            string;
  is_active:       boolean;
  client_org_id:   string;
}

interface PwForm { current: string; newPw: string; confirm: string; }

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  userId:       string;
  /** Breadcrumb text on the back button. Undefined = no back button (My Profile). */
  backLabel?:   string;
  /** Where the back button navigates. Undefined = router.back(). */
  backHref?:    string;
  /** Shows Change Password button (only on My Profile). */
  isSelf?:      boolean;
  /** Hides role + org + active toggles in the edit modal (can't change own role). */
  selfEditOnly?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UserProfileView({ userId, backLabel, backHref, isSelf, selfEditOnly }: Props) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useUserProfile(userId);
  const updateUser = useUpdateUser();
  const { data: orgs = [] } = useOrganizations();

  const isStaff      = user?.is_msp_staff;
  const { data: ticketData } = useUserTickets(userId, isStaff);
  const isOnline        = useChatStore((s) => s.onlineUsers.has(userId));
  const myRole          = useAuthStore((s) => s.user?.role ?? '');
  const isMspViewer     = ['msp_owner', 'msp_manager', 'msp_agent'].includes(myRole);
  const { openDM, initiateSupport } = useChat();
  const recentTickets = (ticketData?.results ?? []).slice(0, 5);

  const [editOpen,  setEditOpen]  = useState(false);
  const [form,      setForm]      = useState<EditForm | null>(null);
  const [apiError,  setApiError]  = useState<string | null>(null);
  const [pwOpen,    setPwOpen]    = useState(false);
  const [pwForm,    setPwForm]    = useState<PwForm>({ current: '', newPw: '', confirm: '' });
  const [pwError,   setPwError]   = useState('');
  const [pwSaved,   setPwSaved]   = useState(false);

  function openEdit() {
    if (!user) return;
    setForm({
      first_name:      user.first_name,
      last_name:       user.last_name,
      email:           user.email,
      phone:           user.phone ?? '',
      job_title:       user.job_title ?? '',
      department:      user.department ?? '',
      employee_id:     user.employee_id ?? '',
      reports_to:      user.reports_to ?? '',
      business_impact: user.business_impact ?? '',
      role:            user.role,
      is_active:       user.is_active,
      client_org_id:   user.org_id ?? '',
    });
    setApiError(null);
    setEditOpen(true);
  }

  function setField(field: keyof EditForm, value: string | boolean) {
    setForm(prev => prev ? { ...prev, [field]: value } : prev);
  }

  function saveEdit() {
    if (!form) return;
    setApiError(null);
    updateUser.mutate(
      {
        id: userId,
        data: {
          first_name:      form.first_name.trim(),
          last_name:       form.last_name.trim(),
          email:           form.email.trim(),
          phone:           form.phone.trim(),
          job_title:       form.job_title.trim(),
          department:      form.department.trim(),
          employee_id:     form.employee_id.trim(),
          reports_to:      form.reports_to.trim(),
          business_impact: form.business_impact.trim(),
          ...(!selfEditOnly && { role: form.role, is_active: form.is_active, client_org_id: form.client_org_id || null }),
        },
      },
      {
        onSuccess: () => setEditOpen(false),
        onError:   (err: unknown) => setApiError((err as { message?: string })?.message ?? 'Failed to save.'),
      }
    );
  }

  function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    if (pwForm.newPw.length < 8)         { setPwError('Minimum 8 characters.'); return; }
    setPwSaved(true);
    setPwForm({ current: '', newPw: '', confirm: '' });
    setTimeout(() => { setPwSaved(false); setPwOpen(false); }, 1800);
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Loading profile…</p>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div style={{ fontSize: 32, color: 'var(--border-md)' }}>✕</div>
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>User not found</p>
        <button
          className="btn-primary gap-1.5"
          style={{ fontSize: 11 }}
          onClick={() => backHref ? router.push(backHref) : router.back()}
        >
          <ArrowLeft size={12} /> Go Back
        </button>
      </div>
    );
  }

  const avatarColor = getAvatarColor(user.full_name);
  const initials    = getInitials(user.full_name);
  const roleCfg     = ROLE_CFG[user.role] ?? { label: user.role, color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' };
  const memberDate  = user.date_joined
    ? new Date(user.date_joined).toLocaleDateString('en-US', { dateStyle: 'medium' })
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4" style={{ height: 38, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>

        {/* Back button */}
        {backLabel !== undefined ? (
          <button
            className="flex items-center gap-1.5"
            style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px 4px 0', fontSize: 12 }}
            onClick={() => backHref ? router.push(backHref) : router.back()}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <ArrowLeft size={13} />
            {backLabel && <span style={{ ...MONO, fontSize: 11, fontWeight: 600 }}>{backLabel}</span>}
          </button>
        ) : null}

        <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>
          {isSelf ? 'My Profile' : 'User Profile'}
        </span>
        <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: roleCfg.color, background: roleCfg.bg, padding: '2px 8px' }}>
          {roleCfg.label}
        </span>

        <div style={{ flex: 1 }} />

        {isSelf && (
          <button
            onClick={() => setPwOpen(true)}
            className="flex items-center gap-1.5"
            style={{
              ...MONO, fontSize: 11, fontWeight: 600, marginRight: 6,
              color: 'var(--text-3)', background: 'transparent', border: '1px solid var(--border-md)',
              padding: '4px 10px', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          >
            <Key size={11} /> Change Password
          </button>
        )}

        {!isSelf && (
          <button
            onClick={() => isMspViewer && !user.is_msp_staff
              ? initiateSupport(userId, user.full_name)
              : openDM(userId, user.full_name)
            }
            className="flex items-center gap-1.5"
            style={{
              ...MONO, fontSize: 11, fontWeight: 600, marginRight: 6,
              color: 'var(--accent-indigo-fg)', background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              padding: '4px 10px', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
          >
            <MessageCircle size={11} /> Message
          </button>
        )}

        <button
          onClick={openEdit}
          className="flex items-center gap-1.5"
          style={{
            ...MONO, fontSize: 11, fontWeight: 600,
            color: 'var(--accent-info-fg)', background: 'rgba(37,99,235,0.12)',
            border: '1px solid rgba(37,99,235,0.3)',
            padding: '4px 10px', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.22)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.12)'; }}
        >
          <Edit2 size={11} /> Edit Profile
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Hero card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '24px' }}>
            <div className="flex items-start gap-5">
              <div style={{
                width: 68, height: 68, borderRadius: '50%', background: avatarColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: '#fff', flexShrink: 0,
                border: `3px solid ${roleCfg.color}30`,
              }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: 'var(--text-0)', marginBottom: 4 }}>
                  {user.full_name}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: roleCfg.color, background: roleCfg.bg, padding: '2px 10px' }}>
                    {roleCfg.label}
                  </span>
                  {isStaff
                    ? <span className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--accent-ok-fg)' }}><ShieldCheck size={12} /> MSP Staff</span>
                    : user.org_name && (
                        <span className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          <Building2 size={12} /> {user.org_name}
                        </span>
                      )
                  }
                  <span style={{ fontSize: 11, color: user.is_active ? '#34d399' : '#f87171' }}>
                    ● {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="flex items-center gap-1" style={{ fontSize: 11, color: isOnline ? '#22c55e' : 'var(--text-3)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? '#22c55e' : 'var(--text-3)', display: 'inline-block' }} />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                {(user.job_title || user.department) && (
                  <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 6 }}>
                    {[user.job_title, user.department].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-3">
            <StatCard value={user.open_tickets}  label={isStaff ? 'Active'   : 'Open'}    color="#fbbf24" />
            <StatCard value={user.solved_tickets} label="Resolved"                         color="#34d399" />
            <StatCard value={user.closed_tickets} label="Closed"                           color="#94a3b8" />
            <StatCard value={user.total_tickets}  label={isStaff ? 'Assigned' : 'Total'}   color="#60a5fa" />
          </div>

          {/* Contact & Details */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <SectionHeader title="Contact & Details" />
            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 40px' }}>
              <Field label="Email"      value={user.email}      icon={Mail}      />
              <Field label="Phone"      value={user.phone}      icon={Phone}     />
              <Field label="Job Title"  value={user.job_title}  icon={Briefcase} />
              <Field label="Department" value={user.department} icon={Users}     />
              {!isStaff && user.org_name && (
                <Field label="Organization" value={user.org_name} icon={Building2} />
              )}
              <Field label="Member Since" value={memberDate} icon={Clock} />
            </div>
          </div>

          {/* Recent Tickets */}
          {user.total_tickets > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <SectionHeader title={isStaff ? 'Recent Assigned Tickets' : 'Recent Tickets'} />
              {recentTickets.length === 0 ? (
                <div style={{ padding: '24px 20px', fontSize: 12, color: 'var(--text-3)' }}>Loading…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Ref', 'Subject', 'Status', 'Priority', 'Created'].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentTickets.map((t, i) => {
                      const st = STATUS_CFG[t.status]   ?? { label: t.status,   color: 'var(--text-3)' };
                      const pr = PRIORITY_CFG[t.priority] ?? { label: t.priority, color: 'var(--text-3)' };
                      return (
                        <tr key={t.id} style={{ borderBottom: i < recentTickets.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer' }}
                          onClick={() => router.push(`/requests/${t.ref}`)}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--accent-info-fg)' }}>{t.ref}</span>
                          </td>
                          <td style={{ padding: '10px 16px', maxWidth: 260 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-0)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: st.color, background: st.color + '18', padding: '2px 8px' }}>{st.label}</span>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: pr.color }}>{pr.label}</span>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ ...MONO, fontSize: 11, color: 'var(--text-4)' }}>
                              {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Profile Details */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <SectionHeader title="Profile Details" />
            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 40px' }}>
              <Field label="Employee ID"     value={user.employee_id}     />
              <Field label="Reports To"      value={user.reports_to}      />
              <Field label="Business Impact" value={user.business_impact} />
            </div>
          </div>

        </div>
      </div>

      {/* ── Edit Profile Modal ────────────────────────────────────────────────── */}
      {editOpen && form && (
        <>
          <div onClick={() => setEditOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 560, maxHeight: '88vh',
            background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            zIndex: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', height: 46, flexShrink: 0, borderBottom: '1px solid var(--border-md)' }}>
              <Edit2 size={13} style={{ color: 'var(--accent-info-fg)' }} />
              <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: 'var(--text-0)', flex: 1 }}>Edit Profile</span>
              <span style={{ ...MONO, fontSize: 11, color: roleCfg.color, background: roleCfg.bg, padding: '2px 8px' }}>{user.full_name}</span>
              <button onClick={() => setEditOpen(false)}
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {apiError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 12px', fontSize: 12, color: 'var(--accent-danger-fg)' }}>
                  {apiError}
                </div>
              )}

              {/* First / Last */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['first_name', 'last_name'] as const).map(f => (
                  <div key={f}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                      {f === 'first_name' ? 'First Name' : 'Last Name'}
                    </label>
                    <input style={INPUT} value={form[f]} onChange={e => setField(f, e.target.value)}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                  </div>
                ))}
              </div>

              {/* Email / Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Email</label>
                  <input style={INPUT} type="email" value={form.email} onChange={e => setField('email', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Phone</label>
                  <input style={INPUT} value={form.phone} onChange={e => setField('phone', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
              </div>

              {/* Job Title / Department */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Job Title</label>
                  <input style={INPUT} value={form.job_title} onChange={e => setField('job_title', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Department</label>
                  <input style={INPUT} value={form.department} onChange={e => setField('department', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
              </div>

              {/* Employee ID / Reports To */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Employee ID</label>
                  <input style={INPUT} value={form.employee_id} onChange={e => setField('employee_id', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Reports To</label>
                  <input style={INPUT} value={form.reports_to} onChange={e => setField('reports_to', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
              </div>

              {/* Business Impact */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Business Impact</label>
                <input style={INPUT} value={form.business_impact} onChange={e => setField('business_impact', e.target.value)}
                  placeholder="e.g. High — production system down"
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
              </div>

              {/* Role + Status (hidden for self-edit) */}
              {!selfEditOnly && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Role</label>
                    <select style={SELECT} value={form.role} onChange={e => setField('role', e.target.value)}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}>
                      {(['msp_owner', 'msp_manager', 'msp_agent'].includes(form.role)
                        ? MSP_ROLE_OPTIONS
                        : CLIENT_ROLE_OPTIONS
                      ).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Status</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      {[true, false].map(val => (
                        <button key={String(val)} onClick={() => setField('is_active', val)} style={{
                          flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${form.is_active === val ? (val ? '#34d399' : '#f87171') : 'var(--border-md)'}`,
                          background: form.is_active === val ? (val ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)') : 'transparent',
                          color: form.is_active === val ? (val ? '#34d399' : '#f87171') : 'var(--text-4)',
                        }}>
                          {val ? 'Active' : 'Inactive'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Organization (client users only, non-self-edit) */}
              {!selfEditOnly && !['msp_owner', 'msp_manager', 'msp_agent'].includes(form.role) && (
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Organization</label>
                  <select style={SELECT} value={form.client_org_id} onChange={e => setField('client_org_id', e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}>
                    <option value="">— None —</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-md)' }}>
              <button onClick={() => setEditOpen(false)}
                style={{ ...MONO, fontSize: 12, padding: '7px 16px', cursor: 'pointer', color: 'var(--text-4)', background: 'transparent', border: '1px solid var(--border-md)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={updateUser.isPending}
                className="flex items-center gap-1.5"
                style={{ ...MONO, fontSize: 12, padding: '7px 16px', cursor: 'pointer', color: '#fff', background: '#2563eb', border: '1px solid #2563eb', opacity: updateUser.isPending ? 0.6 : 1 }}
                onMouseEnter={e => { if (!updateUser.isPending) e.currentTarget.style.background = '#1d4ed8'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#2563eb'; }}>
                {updateUser.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {updateUser.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Change Password Modal ─────────────────────────────────────────────── */}
      {pwOpen && (
        <>
          <div onClick={() => { setPwOpen(false); setPwError(''); setPwSaved(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 400, background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            zIndex: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', height: 46, flexShrink: 0, borderBottom: '1px solid var(--border-md)' }}>
              <Key size={13} style={{ color: 'var(--accent-info-fg)' }} />
              <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: 'var(--text-0)', flex: 1 }}>Change Password</span>
              <button onClick={() => { setPwOpen(false); setPwError(''); setPwSaved(false); }}
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}>
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handlePasswordChange} style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pwSaved && (
                <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', padding: '8px 12px', fontSize: 12, color: 'var(--accent-ok-fg)' }}>
                  Password updated.
                </div>
              )}
              {pwError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 12px', fontSize: 12, color: 'var(--accent-danger-fg)' }}>
                  {pwError}
                </div>
              )}
              {(['current', 'newPw', 'confirm'] as const).map(f => (
                <div key={f}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                    {f === 'current' ? 'Current Password' : f === 'newPw' ? 'New Password' : 'Confirm New Password'}
                  </label>
                  <input style={INPUT} type="password" value={pwForm[f]}
                    onChange={e => setPwForm(p => ({ ...p, [f]: e.target.value }))}
                    autoComplete={f === 'current' ? 'current-password' : 'new-password'}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }} />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button type="button" onClick={() => { setPwOpen(false); setPwError(''); setPwSaved(false); }}
                  style={{ ...MONO, fontSize: 12, padding: '7px 16px', cursor: 'pointer', color: 'var(--text-4)', background: 'transparent', border: '1px solid var(--border-md)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}>
                  Cancel
                </button>
                <button type="submit" className="flex items-center gap-1.5"
                  style={{ ...MONO, fontSize: 12, padding: '7px 16px', cursor: 'pointer', color: '#fff', background: '#2563eb', border: '1px solid #2563eb' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#2563eb'; }}>
                  <Key size={12} /> Update Password
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
