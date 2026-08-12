'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Star, Plus, X, Loader2, Mail, Users, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { useVIPRule, useUpdateVIPRule, useAllClientUsers, useToggleVIPUser } from '@/hooks/useSLA';

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
function avatarColor(name: string) {
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}

export default function VIPRulesPage() {
  const router = useRouter();

  const { data: rule,  isLoading: ruleLoading }  = useVIPRule();
  const { data: users, isLoading: usersLoading } = useAllClientUsers();
  const updateRule  = useUpdateVIPRule();
  const toggleVIP   = useToggleVIPUser();

  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [search,     setSearch]     = useState('');

  function handleToggleActive() {
    if (!rule) return;
    updateRule.mutate({ is_active: !rule.is_active });
  }

  function handleAddEmail() {
    setEmailError('');
    const v = emailInput.trim().toLowerCase();
    if (!v) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(v)) { setEmailError('Invalid email address.'); return; }
    const list = rule?.notification_emails ?? [];
    if (list.includes(v)) { setEmailError('Already in the list.'); return; }
    updateRule.mutate({ notification_emails: [...list, v] });
    setEmailInput('');
  }

  function handleRemoveEmail(email: string) {
    if (!rule) return;
    updateRule.mutate({ notification_emails: rule.notification_emails.filter(e => e !== email) });
  }

  const filteredUsers = (users ?? []).filter(u => {
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.org_name ?? '').toLowerCase().includes(q)
    );
  });

  const vipCount = (users ?? []).filter(u => u.is_vip).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Page header */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <button
          onClick={() => router.push('/settings/sla/policies')}
          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 4px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
        >
          <ArrowLeft size={14} />
        </button>
        <Star size={13} style={{ color: '#f59e0b' }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>VIP Rules</div>
          <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>Notify staff when a VIP client submits a new ticket</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {ruleLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
          </div>
        ) : (
          <>
            {/* ── Rule config card ─────────────────────────────────────────── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Star size={12} style={{ color: '#f59e0b' }} /> VIP Alert Rule
                </span>
                <button
                  onClick={handleToggleActive}
                  disabled={updateRule.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                >
                  {rule?.is_active ? (
                    <>
                      <ToggleRight size={22} style={{ color: '#22c55e' }} />
                      <span style={{ color: '#22c55e', fontWeight: 600 }}>Active</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={22} style={{ color: 'var(--text-5)' }} />
                      <span style={{ color: 'var(--text-5)' }}>Inactive</span>
                    </>
                  )}
                </button>
              </div>

              {/* Notification emails */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={11} /> Notification Emails
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    type="email"
                    placeholder="agent@example.com"
                    value={emailInput}
                    onChange={e => { setEmailInput(e.target.value); setEmailError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail(); } }}
                    style={{
                      flex: 1, height: 32, padding: '0 10px',
                      background: 'var(--bg-base)', border: `1px solid ${emailError ? '#ef4444' : 'var(--border-md)'}`,
                      color: 'var(--text-1)', fontSize: 12, outline: 'none',
                    }}
                    onFocus={e => { if (!emailError) e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e => { if (!emailError) e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                  />
                  <button
                    onClick={handleAddEmail}
                    disabled={updateRule.isPending}
                    style={{
                      height: 32, padding: '0 12px', background: '#2563eb', border: 'none',
                      color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      opacity: updateRule.isPending ? 0.6 : 1,
                    }}
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>
                {emailError && (
                  <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>{emailError}</div>
                )}
                {(rule?.notification_emails ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-5)', fontStyle: 'italic' }}>
                    No notification emails yet — add at least one to receive VIP alerts.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rule!.notification_emails.map(email => (
                      <span
                        key={email}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 11, background: 'rgba(245,158,11,0.1)',
                          border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24',
                          padding: '3px 8px',
                        }}
                      >
                        {email}
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fbbf24', display: 'flex', alignItems: 'center', padding: 0, opacity: 0.6 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Email template preview */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={11} /> Alert Email Preview
                </div>
                <div style={{
                  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
                  padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)',
                  lineHeight: 1.6,
                }}>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-5)' }}>Subject: </span>
                    <span style={{ color: '#fbbf24' }}>[VIP] New ticket from {'{'}user.full_name{'}'}</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                    <div>Hi,</div>
                    <div style={{ marginTop: 8 }}>
                      VIP client <span style={{ color: '#60a5fa' }}>{'{'}user.full_name{'}'}</span>{' '}
                      (<span style={{ color: '#60a5fa' }}>{'{'}user.email{'}'}</span>) at{' '}
                      <span style={{ color: '#60a5fa' }}>{'{'}org_name{'}'}</span> has just submitted a new ticket:
                    </div>
                    <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid rgba(245,158,11,0.4)' }}>
                      <div>Ticket: <span style={{ color: '#a78bfa' }}>#{'{'}ticket.id{'}'} — {'{'}ticket.subject{'}'}</span></div>
                      <div>Priority: <span style={{ color: '#a78bfa' }}>{'{'}ticket.priority{'}'}</span></div>
                      <div>Created: <span style={{ color: '#a78bfa' }}>{'{'}created_at{'}'}</span></div>
                    </div>
                    <div style={{ marginTop: 8 }}>Please ensure this ticket receives priority attention.</div>
                    <div style={{ marginTop: 12, color: 'var(--text-5)' }}>— MateDesk SLA Monitor</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── VIP Users table ────────────────────────────────────────────── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Users size={12} style={{ color: '#60a5fa' }} /> Client Users
                  {users && (
                    <span style={{ fontSize: 11, color: 'var(--text-5)', background: 'var(--bg-elevated)', padding: '1px 6px' }}>
                      {users.length}
                    </span>
                  )}
                  {vipCount > 0 && (
                    <span style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 7px' }}>
                      {vipCount} VIP
                    </span>
                  )}
                </span>
                <input
                  type="text"
                  placeholder="Search users…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    height: 28, padding: '0 10px', width: 200,
                    background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                    color: 'var(--text-1)', fontSize: 12, outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>

              {usersLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: '#2563eb' }} />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-5)' }}>
                  {search ? 'No users match your search.' : 'No client users found.'}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Organization</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>VIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 26, height: 26, borderRadius: '50%',
                                background: avatarColor(user.full_name),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
                              }}
                            >
                              {user.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                {user.full_name}
                                {user.is_vip && (
                                  <Star size={10} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{user.org_name ?? '—'}</td>
                        <td>
                          <span style={{ fontSize: 11, color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '2px 7px' }}>
                            {user.role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 11, color: user.is_active ? '#34d399' : '#f87171' }}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => toggleVIP.mutate({ id: user.id, is_vip: !user.is_vip })}
                            disabled={toggleVIP.isPending}
                            title={user.is_vip ? 'Remove VIP' : 'Mark as VIP'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}
                          >
                            <Star
                              size={15}
                              style={{
                                color: user.is_vip ? '#f59e0b' : 'var(--text-5)',
                                fill: user.is_vip ? '#f59e0b' : 'none',
                                transition: 'color 0.15s, fill 0.15s',
                              }}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
