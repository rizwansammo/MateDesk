'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ChevronDown, Building2, Lock } from 'lucide-react';
import { useCreateTicket } from '@/hooks/useTickets';
import { useClientOrgs } from '@/hooks/useClientOrgs';
import { useOrgUsers } from '@/hooks/useOrganizations';
import { useAgents } from '@/hooks/useAgents';
import { useAuthStore } from '@/store/useAuthStore';

const PRIORITIES = [
  { value: 'low',      label: 'Low'      },
  { value: 'normal',   label: 'Medium'   },
  { value: 'high',     label: 'High'     },
  { value: 'critical', label: 'Critical' },
];

const lbl = 'block mb-1.5 font-medium text-[var(--text-3)]';
const inp = 'w-full h-10 px-3 bg-[var(--bg-card)] border border-[var(--border-md)] text-[var(--text-1)] placeholder-[var(--text-3)] outline-none focus:border-[#3b82f6] transition-colors text-[13px]';
const sel = `${inp} cursor-pointer appearance-none`;

type TicketType = 'client' | 'internal';

export default function NewTicketPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isMSP = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const createTicket  = useCreateTicket();
  const { data: orgs,   isLoading: orgsLoading   } = useClientOrgs();
  const { data: agents, isLoading: agentsLoading } = useAgents();

  const [ticketType,    setTicketType]    = useState<TicketType>('client');
  const [subject,       setSubject]       = useState('');
  const [description,   setDescription]   = useState('');
  const [clientOrgId,   setClientOrgId]   = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterOpen, setRequesterOpen] = useState(false);
  const [priority,      setPriority]      = useState('normal');
  const [category,      setCategory]      = useState('');
  const [assigneeId,    setAssigneeId]    = useState('');
  const [dueBy,         setDueBy]         = useState('');
  const [error,         setError]         = useState('');

  const { data: orgUsers } = useOrgUsers(clientOrgId);

  const filteredUsers = clientOrgId && orgUsers
    ? orgUsers.filter(u =>
        u.full_name.toLowerCase().includes(requesterName.toLowerCase())
      )
    : [];

  function handleOrgChange(id: string) {
    setClientOrgId(id);
    setRequesterName('');
  }

  function handleTypeChange(t: TicketType) {
    setTicketType(t);
    setClientOrgId('');
    setRequesterName('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const payload: Record<string, unknown> = {
      subject,
      description,
      priority,
      ...(category   && { category }),
      ...(assigneeId && { assignee_id: assigneeId }),
      ...(dueBy      && { due_by: dueBy }),
    };

    if (isMSP && ticketType === 'internal') {
      payload.is_internal = true;
    } else if (isMSP && ticketType === 'client') {
      if (clientOrgId)   payload.client_org_id  = clientOrgId;
      if (requesterName) payload.requester_name = requesterName;
    }

    try {
      const ticket = await createTicket.mutateAsync(payload);
      router.push(`/requests/${ticket.ref}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create ticket';
      setError(msg);
    }
  }

  const isSubmitting = createTicket.isPending;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/requests')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>New Ticket</span>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto flex justify-center" style={{ background: 'var(--bg-deep)', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>

          <div
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border-panel)',
              padding: '28px 32px 32px',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-0)', marginBottom: 24 }}>
              Create New Ticket
            </h2>

            {/* ── Ticket type selector — MSP only ─────────────────────────── */}
            {isMSP && (
              <div style={{ display: 'flex', gap: 0, marginBottom: 28, border: '1px solid var(--border-md)' }}>
                {([
                  { type: 'client'   as TicketType, Icon: Building2, label: 'Client Ticket',   desc: 'For a client organisation' },
                  { type: 'internal' as TicketType, Icon: Lock,      label: 'Internal Ticket', desc: 'For MSP staff only'         },
                ]).map(({ type, Icon, label, desc }, i) => {
                  const active = ticketType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 18px',
                        background: active ? (type === 'internal' ? 'rgba(139,92,246,0.10)' : 'rgba(37,99,235,0.10)') : 'var(--bg-card)',
                        border: 'none',
                        borderRight: i === 0 ? '1px solid var(--border-md)' : 'none',
                        borderBottom: active ? `2px solid ${type === 'internal' ? '#a78bfa' : '#2563eb'}` : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        textAlign: 'left',
                      }}
                    >
                      <Icon
                        size={18}
                        style={{ color: active ? (type === 'internal' ? '#a78bfa' : '#2563eb') : 'var(--text-3)', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--text-0)' : 'var(--text-3)' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                          {desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Internal ticket info banner */}
            {isMSP && ticketType === 'internal' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', marginBottom: 20,
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.25)',
              }}>
                <Lock size={13} style={{ color: 'var(--accent-violet-fg)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Reported by <strong style={{ color: 'var(--text-1)' }}>{user?.full_name}</strong> · Visible to MSP staff only
                </span>
              </div>
            )}

            {error && (
              <div className="mb-4 px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-danger-fg)', fontSize: 12 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

              {/* Subject */}
              <div>
                <label className={lbl} style={{ fontSize: 12 }}>
                  Subject <span style={{ color: 'var(--accent-danger-fg)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Brief description of the issue"
                  className={inp}
                />
              </div>

              {/* Description */}
              <div>
                <label className={lbl} style={{ fontSize: 12 }}>
                  Description <span style={{ color: 'var(--accent-danger-fg)' }}>*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detailed description…"
                  className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-md)] text-[var(--text-1)] placeholder-[var(--text-3)] outline-none focus:border-[#3b82f6] transition-colors resize-y text-[13px]"
                  style={{ minHeight: 100 }}
                />
              </div>

              {/* Client Org + Requester — client tickets only */}
              {isMSP && ticketType === 'client' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl} style={{ fontSize: 12 }}>Client Organization</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={clientOrgId}
                        onChange={e => handleOrgChange(e.target.value)}
                        disabled={orgsLoading}
                        className={sel}
                      >
                        <option value="">— Select client —</option>
                        {(orgs ?? []).map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  {/* Requester combobox */}
                  <div>
                    <label className={lbl} style={{ fontSize: 12 }}>Requester Name</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={requesterName}
                        onChange={e => { setRequesterName(e.target.value); setRequesterOpen(true); }}
                        onFocus={() => setRequesterOpen(true)}
                        onBlur={() => setTimeout(() => setRequesterOpen(false), 150)}
                        placeholder={clientOrgId ? 'Type to filter contacts…' : 'Contact person\'s name'}
                        className={inp}
                        style={{ paddingRight: clientOrgId ? 28 : undefined }}
                      />
                      {clientOrgId && (
                        <ChevronDown size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                      )}
                      {requesterOpen && filteredUsers.length > 0 && (
                        <div
                          style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderTop: 'none',
                            maxHeight: 160, overflowY: 'auto',
                          }}
                        >
                          {filteredUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setRequesterName(u.full_name); setRequesterOpen(false); }}
                              style={{
                                display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left',
                                padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                                borderBottom: '1px solid var(--border-subtle)',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                            >
                              <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{u.full_name}</span>
                              {u.email && (
                                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{u.email}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Priority + Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl} style={{ fontSize: 12 }}>Priority</label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value)}
                      className={sel}
                    >
                      {PRIORITIES.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                  </div>
                </div>
                <div>
                  <label className={lbl} style={{ fontSize: 12 }}>Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Network, Hardware"
                    className={inp}
                  />
                </div>
              </div>

              {/* Assign To + Due By — MSP only */}
              {isMSP && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl} style={{ fontSize: 12 }}>Assign To</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={assigneeId}
                        onChange={e => setAssigneeId(e.target.value)}
                        disabled={agentsLoading}
                        className={sel}
                      >
                        <option value="">— Unassigned —</option>
                        {(agents ?? []).map(a => (
                          <option key={a.id} value={a.id}>{a.full_name}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl} style={{ fontSize: 12 }}>Due By</label>
                    <input
                      type="datetime-local"
                      value={dueBy}
                      onChange={e => setDueBy(e.target.value)}
                      className={inp}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: isMSP && ticketType === 'internal' ? '#7c3aed' : '#2563eb',
                    fontSize: 13,
                  }}
                >
                  {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                  {isSubmitting ? 'Creating…' : 'Create Ticket'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/requests')}
                  className="px-5 py-2.5 font-medium transition-colors"
                  style={{
                    fontSize: 13, color: 'var(--text-4)',
                    border: '1px solid var(--border-md)', background: 'transparent',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}
                >
                  Cancel
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
