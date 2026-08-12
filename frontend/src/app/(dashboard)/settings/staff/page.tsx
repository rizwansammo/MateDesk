'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Loader2, UserPlus, X, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgents } from '@/hooks/useAgents';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const ROLE_LABELS: Record<string, string> = {
  msp_owner:   'Owner',
  msp_manager: 'Manager',
  msp_agent:   'Agent',
};

const ROLE_COLORS: Record<string, string> = {
  msp_owner:   '#60a5fa',
  msp_manager: '#818cf8',
  msp_agent:   '#34d399',
};

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
function avatarColor(name: string) {
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}

const inp = 'w-full h-9 px-3 text-[13px] bg-[var(--bg-base)] border border-[var(--border-md)] text-[var(--text-1)] placeholder-[#3d4a6b] outline-none focus:border-[#2563eb] transition-colors';

interface CreateStaffForm {
  first_name: string;
  last_name:  string;
  email:      string;
  password:   string;
  role:       string;
}

export default function StaffMembersPage() {
  const router      = useRouter();
  const currentUser = useAuthStore(s => s.user);
  const canCreate   = currentUser?.role === 'msp_owner' || currentUser?.role === 'msp_manager';

  const { data: staff = [], isLoading } = useAgents();
  const qc = useQueryClient();

  const owners   = staff.filter(s => s.role === 'msp_owner');
  const managers = staff.filter(s => s.role === 'msp_manager');
  const agents   = staff.filter(s => s.role === 'msp_agent');

  const groups = [
    { label: 'Owners',   color: '#60a5fa', members: owners   },
    { label: 'Managers', color: '#818cf8', members: managers },
    { label: 'Agents',   color: '#34d399', members: agents   },
  ].filter(g => g.members.length > 0);

  const [showModal,   setShowModal]   = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [formError,   setFormError]   = useState('');
  const [form, setForm] = useState<CreateStaffForm>({ first_name: '', last_name: '', email: '', password: '', role: 'msp_agent' });

  const createMutation = useMutation({
    mutationFn: (data: CreateStaffForm) =>
      apiFetch('/api/staff/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      setShowModal(false);
      setForm({ first_name: '', last_name: '', email: '', password: '', role: 'msp_agent' });
      setFormError('');
    },
    onError: (err: unknown) => {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create staff account.');
    },
  });

  function openModal() {
    setForm({ first_name: '', last_name: '', email: '', password: '', role: 'msp_agent' });
    setFormError('');
    setShowPw(false);
    setShowModal(true);
  }

  const roleOptions = currentUser?.role === 'msp_owner'
    ? [
        { value: 'msp_agent',   label: 'Agent' },
        { value: 'msp_manager', label: 'Manager' },
        { value: 'msp_owner',   label: 'Owner' },
      ]
    : [
        { value: 'msp_agent',   label: 'Agent' },
        { value: 'msp_manager', label: 'Manager' },
      ];

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
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Staff Members</span>
        {canCreate && (
          <div className="ml-auto">
            <button
              onClick={openModal}
              className="flex items-center gap-1.5"
              style={{ height: 28, padding: '0 12px', background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none' }}
            >
              <UserPlus size={12} /> Create Staff Account
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 40, background: 'rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Staff Members</h1>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>MSP team members — owners, managers, and agents.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
            </div>
          ) : staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users size={32} style={{ color: 'var(--border-md)' }} />
              <p style={{ fontSize: 13, color: 'var(--text-5)' }}>No staff members found.</p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>

              {/* Summary */}
              <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {[
                  { label: 'Total Staff', value: staff.length,   color: '#60a5fa' },
                  { label: 'Owners',      value: owners.length,   color: '#60a5fa' },
                  { label: 'Managers',    value: managers.length, color: '#818cf8' },
                  { label: 'Agents',      value: agents.length,   color: '#34d399' },
                ].map(s => (
                  <div
                    key={s.label}
                    className="flex flex-col items-center justify-center gap-1 py-4 flex-1"
                    style={{ borderRight: '1px solid var(--border-subtle)' }}
                  >
                    <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Table */}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <>
                      <tr key={group.label} style={{ background: 'var(--bg-surface)' }}>
                        <td colSpan={3} style={{ padding: '6px 16px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: group.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {group.label} ({group.members.length})
                          </span>
                        </td>
                      </tr>
                      {group.members.map(member => (
                        <tr key={member.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <div
                                className="flex items-center justify-center font-bold text-white flex-shrink-0"
                                style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(member.full_name), fontSize: 11 }}
                              >
                                {member.full_name.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{member.full_name}</span>
                            </div>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: 11, padding: '2px 8px', fontWeight: 600,
                                color: ROLE_COLORS[member.role] ?? 'var(--text-3)',
                                background: (ROLE_COLORS[member.role] ?? '#94a3b8') + '18',
                              }}
                            >
                              {ROLE_LABELS[member.role] ?? member.role}
                            </span>
                          </td>
                          <td>
                            <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#34d399' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* Create Staff Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 480, padding: 32 }}>
            <div className="flex items-center justify-between mb-5">
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Create Staff Account</div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>First Name</label>
                <input type="text" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="John" className={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Last Name</label>
                <input type="text" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Smith" className={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Email Address</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.com" className={inp} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                  className={inp}
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer' }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className={inp}
                style={{ cursor: 'pointer' }}
              >
                {roleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {formError && (
              <div className="flex items-center gap-2 mb-4" style={{ padding: '8px 12px', fontSize: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                <AlertCircle size={12} style={{ flexShrink: 0 }} /> {formError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                style={{ height: 34, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.email || !form.password}
                className="flex items-center gap-2"
                style={{ height: 34, padding: '0 16px', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: createMutation.isPending || !form.email || !form.password ? 0.5 : 1 }}
              >
                {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                {createMutation.isPending ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
