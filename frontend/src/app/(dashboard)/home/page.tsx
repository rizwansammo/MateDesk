'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Clock, Calendar, Inbox, CheckCircle, Mail,
  Plus, ChevronRight, Users, Activity,
  BookOpen, Trash2, X, Loader2, Megaphone, Send,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTicketStats, useTickets } from '@/hooks/useTickets';
import {
  useAgentTodos, useCreateTodo, useToggleTodo, useDeleteTodo,
  useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement,
} from '@/hooks/useProductivity';
import { useAgents } from '@/hooks/useAgents';

const STATUS_COLORS: Record<string, string> = {
  open: '#60a5fa', pending: '#fbbf24', in_progress: '#818cf8',
  solved: '#34d399', closed: '#64748b',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#22c55e', normal: '#3b82f6', high: '#f59e0b', critical: '#ef4444',
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <div
      className="cursor-pointer transition-all"
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--bg-elevated)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color + '40'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-elevated)'; }}
    >
      <div style={{ width: 42, height: 42, background: color + '18', color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div style={{ fontFamily: 'var(--font-hemi)', fontSize: 32, lineHeight: 1, color }}>{value}</div>
        <div className="truncate" style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

// ── New Announcement Modal ────────────────────────────────────────────────────

function NewAnnouncementModal({ onClose }: { onClose: () => void }) {
  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [mode,        setMode]        = useState<'all' | 'specific'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error,       setError]       = useState('');
  const { data: agents = [] }         = useAgents();
  const createAnn                     = useCreateAnnouncement();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim() || !body.trim()) { setError('Title and message are required.'); return; }
    if (mode === 'specific' && selectedIds.length === 0) { setError('Select at least one agent.'); return; }
    try {
      await createAnn.mutateAsync({ title: title.trim(), body: body.trim(), recipient_mode: mode, recipient_ids: mode === 'specific' ? selectedIds : [] });
      onClose();
    } catch {
      setError('Failed to post. Try again.');
    }
  }

  function toggleAgent(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: 'var(--bg-card)', border: '1px solid var(--border-md)',
    color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', zIndex: 8001, top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(560px, 94vw)', background: 'var(--bg-deep)',
        border: '1px solid var(--border-panel)', borderTop: '2px solid #f59e0b',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border-panel)', background: 'var(--bg-surface)' }}>
          <Megaphone size={14} style={{ color: 'var(--accent-warn-fg)' }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>New Announcement</span>
          <button onClick={onClose} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          ><X size={14} /></button>
        </div>
        <form onSubmit={submit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: 'var(--accent-danger-fg)' }}>
              {error}
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title…" style={inp}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your announcement…" rows={5}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Recipients</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {(['all', 'specific'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)} style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${mode === m ? 'rgba(245,158,11,0.5)' : 'var(--border-md)'}`,
                  background: mode === m ? 'rgba(245,158,11,0.1)' : 'transparent',
                  color: mode === m ? '#f59e0b' : 'var(--text-4)',
                }}>
                  {m === 'all' ? 'All Agents' : 'Specific Agents'}
                </button>
              ))}
            </div>
            {mode === 'specific' && (
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-md)', background: 'var(--bg-card)' }}>
                {agents.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}>
                    <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleAgent(a.id)} style={{ accentColor: '#f59e0b' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.full_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>{a.role}</span>
                  </label>
                ))}
                {agents.length === 0 && (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>No agents found.</div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', fontSize: 13, background: 'transparent', border: '1px solid var(--border-panel)', color: 'var(--text-4)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={createAnn.isPending} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600,
              background: '#d97706', color: '#fff', border: 'none', cursor: createAnn.isPending ? 'not-allowed' : 'pointer',
              opacity: createAnn.isPending ? 0.65 : 1,
            }}>
              {createAnn.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Post
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { user }             = useAuthStore();
  const { data: stats }      = useTicketStats();
  const { data: ticketData } = useTickets();
  const { data: myTickets }  = useTickets(
    user?.id ? { assignee_id: user.id } : undefined,
  );
  const { data: todos = [],          isLoading: todosLoading } = useAgentTodos();
  const { data: announcements = [] }                           = useAnnouncements();
  const createTodo  = useCreateTodo();
  const toggleTodo  = useToggleTodo();
  const deleteTodo  = useDeleteTodo();
  const deleteAnn   = useDeleteAnnouncement();

  const [todoInput, setTodoInput] = useState('');
  const [annModal,  setAnnModal]  = useState(false);
  const todoRef = useRef<HTMLInputElement>(null);

  const isMSP              = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');
  const isOwnerOrManager   = ['msp_owner', 'msp_manager'].includes(user?.role ?? '');

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const displayName = user?.full_name || 'there';

  const statCards = [
    { label: 'Need Clarification', value: stats?.pending       ?? 0, color: 'var(--accent-orange-fg)', icon: AlertTriangle },
    { label: 'Requests Overdue',   value: stats?.overdue       ?? 0, color: 'var(--accent-danger-fg)', icon: Clock         },
    { label: 'Due Today',          value: stats?.due_today     ?? 0, color: 'var(--accent-warn-fg)', icon: Calendar      },
    { label: 'Pending',            value: stats?.pending       ?? 0, color: 'var(--accent-info-fg)', icon: Inbox         },
    { label: 'Total Open',         value: stats?.total_open    ?? 0, color: 'var(--accent-indigo-fg)', icon: Activity      },
    { label: 'Unassigned',         value: stats?.unassigned    ?? 0, color: 'var(--text-3)', icon: Users         },
    { label: 'Resolved Today',     value: stats?.solved_today  ?? 0, color: 'var(--accent-ok-fg)', icon: CheckCircle   },
    { label: 'Waiting Client',     value: stats?.waiting_client ?? 0, color: '#22d3ee', icon: Mail         },
  ];

  // Recent tickets: last 24 hours only
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentTickets = (ticketData?.results ?? []).filter(t => new Date(t.created_at).getTime() > cutoff);

  // My overdue: assigned to me, past due_by, not resolved
  const now = new Date();
  const overdueTickets = (myTickets?.results ?? []).filter(t =>
    t.due_by && new Date(t.due_by) < now && !['solved', 'closed'].includes(t.status)
  );

  async function addTodo() {
    const text = todoInput.trim();
    if (!text || createTodo.isPending) return;
    setTodoInput('');
    await createTodo.mutateAsync(text);
    todoRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {annModal && <NewAnnouncementModal onClose={() => setAnnModal(false)} />}

      {/* Secondary bar */}
      <div className="secondary-bar">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            Welcome back, <span style={{ color: 'var(--accent-info-fg)' }}>{displayName}</span>
          </span>
          <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{today}</span>
        </div>
        <div className="ml-auto">
          <button
            className="btn-primary gap-1"
            style={{ fontSize: 11, height: 28, paddingTop: 0, paddingBottom: 0 }}
            onClick={() => router.push('/requests/new')}
          >
            <Plus size={12} /> New Ticket
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">

        {/* Stat cards */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
            {statCards.map(s => <StatCard key={s.label} {...s} />)}
          </div>
        </div>

        {/* 3-column body — equal width, equal height */}
        <div
          className="grid grid-cols-12"
          style={{ height: 380 }}
        >

          {/* ── Col 1 (4/12): Recent Tickets — 24h ── */}
          <div
            className="col-span-12 xl:col-span-4"
            style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <span className="panel-title flex items-center gap-1.5">
                <Activity size={11} /> Recent Tickets
              </span>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '1px 6px' }}>last 24h</span>
                <button className="btn-ghost gap-1" style={{ fontSize: 11 }} onClick={() => router.push('/requests')}>
                  View all <ChevronRight size={11} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {recentTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2" style={{ height: '100%', padding: '0 16px' }}>
                  <Activity size={20} style={{ color: 'var(--border-md)' }} />
                  <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No tickets in the last 24 hours</p>
                  <button className="btn-primary gap-1 mt-1" style={{ fontSize: 11, height: 28 }} onClick={() => router.push('/requests/new')}>
                    <Plus size={12} /> Create ticket
                  </button>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {recentTickets.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                      style={{ fontSize: 12 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      onClick={() => router.push(`/requests/${t.ref}`)}
                    >
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent-info-fg)', flexShrink: 0 }}>{t.ref}</span>
                      <span className="flex-1 truncate" style={{ color: 'var(--text-2)' }}>{t.subject}</span>
                      <span style={{ fontSize: 10, color: STATUS_COLORS[t.status] ?? '#94a3b8', background: (STATUS_COLORS[t.status] ?? '#94a3b8') + '18', padding: '2px 6px', flexShrink: 0 }}>
                        {t.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{timeAgo(t.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 2 (4/12): My Note ── */}
          <div
            className="col-span-12 xl:col-span-4"
            style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <span className="panel-title flex items-center gap-1.5">
                <BookOpen size={11} style={{ color: 'var(--accent-violet-fg)' }} /> My Note
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {todos.filter(t => !t.completed).length > 0 ? `${todos.filter(t => !t.completed).length} pending` : ''}
              </span>
            </div>

            {/* Add input */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexShrink: 0 }}>
              <input
                ref={todoRef}
                value={todoInput}
                onChange={e => setTodoInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
                placeholder="Add a note or task… (Enter to add)"
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 12,
                  background: 'var(--bg-card)', border: '1px solid var(--border-md)',
                  color: 'var(--text-1)', outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.5)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
              />
              <button
                onClick={addTodo}
                disabled={!todoInput.trim() || createTodo.isPending}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: todoInput.trim() ? 'rgba(167,139,250,0.12)' : 'transparent',
                  border: `1px solid ${todoInput.trim() ? 'rgba(167,139,250,0.35)' : 'var(--border-md)'}`,
                  cursor: todoInput.trim() ? 'pointer' : 'default',
                  color: todoInput.trim() ? '#a78bfa' : 'var(--text-3)', flexShrink: 0,
                }}
              >
                {createTodo.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={13} />}
              </button>
            </div>

            {/* Todo list */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {todosLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                </div>
              ) : todos.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-4">
                  <BookOpen size={14} style={{ color: 'var(--border-md)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Your personal notes appear here</span>
                </div>
              ) : (
                todos.map(todo => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={() => toggleTodo.mutate({ id: todo.id, completed: !todo.completed })}
                    onDelete={() => deleteTodo.mutate(todo.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Col 3 (4/12): My Overdue Tickets ── */}
          <div
            className="col-span-12 xl:col-span-4"
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <span className="panel-title flex items-center gap-1.5">
                <AlertTriangle size={11} style={{ color: 'var(--accent-danger-fg)' }} />
                <span style={{ color: 'var(--accent-danger-fg)' }}>My Overdue</span>
              </span>
              <button className="btn-ghost gap-1" style={{ fontSize: 11 }} onClick={() => router.push('/requests')}>
                View all <ChevronRight size={11} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {overdueTickets.length === 0 ? (
                <div className="flex items-center gap-2 px-4" style={{ height: '100%' }}>
                  <CheckCircle size={14} style={{ color: 'var(--accent-ok-fg)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--accent-ok-fg)' }}>No overdue tickets — great work!</span>
                </div>
              ) : (
                overdueTickets.map(t => {
                  const daysOver = Math.max(1, Math.floor((now.getTime() - new Date(t.due_by!).getTime()) / 86400000));
                  return (
                    <div
                      key={t.id}
                      className="cursor-pointer px-4 py-2.5"
                      style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      onClick={() => router.push(`/requests/${t.ref}`)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'var(--accent-danger-fg)', flexShrink: 0 }}>{t.ref}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-danger-fg)', background: 'rgba(248,113,113,0.12)', padding: '1px 5px', flexShrink: 0 }}>
                          {daysOver}d overdue
                        </span>
                        <span style={{ fontSize: 10, color: PRIORITY_COLORS[t.priority] ?? '#94a3b8', flexShrink: 0, marginLeft: 'auto' }}>{t.priority}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* ── Announcement Board (full width) ── */}
        {isMSP && (
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="panel-title flex items-center gap-1.5">
                <Megaphone size={11} style={{ color: 'var(--accent-warn-fg)' }} /> Announcement Board
              </span>
              {isOwnerOrManager && (
                <button className="btn-ghost gap-1" style={{ fontSize: 11 }} onClick={() => setAnnModal(true)}>
                  <Plus size={11} /> New Announcement
                </button>
              )}
            </div>

            {announcements.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-5">
                <Megaphone size={16} style={{ color: 'var(--border-md)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {isOwnerOrManager ? 'No announcements yet. Click "New Announcement" to post one.' : 'No announcements for you.'}
                </span>
              </div>
            ) : (
              <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {announcements.map(ann => (
                  <div
                    key={ann.id}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border-md)',
                      borderTop: '2px solid rgba(245,158,11,0.6)',
                      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.3 }}>{ann.title}</div>
                      {isOwnerOrManager && (
                        <button
                          onClick={() => deleteAnn.mutate(ann.id)}
                          title="Delete"
                          style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.65, margin: 0, flex: 1, whiteSpace: 'pre-wrap' }}>{ann.body}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ann.created_by}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{fmtDate(ann.created_at)}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px',
                        background: ann.recipient_mode === 'all' ? 'rgba(245,158,11,0.12)' : 'rgba(167,139,250,0.12)',
                        color: ann.recipient_mode === 'all' ? '#f59e0b' : '#a78bfa',
                      }}>
                        {ann.recipient_mode === 'all' ? 'ALL' : 'SPECIFIC'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── TodoRow ───────────────────────────────────────────────────────────────────

import type { AgentTodo } from '@/hooks/useProductivity';

function TodoRow({ todo, onToggle, onDelete }: { todo: AgentTodo; onToggle: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={onToggle}
        style={{ accentColor: '#a78bfa', flexShrink: 0, cursor: 'pointer', width: 14, height: 14 }}
      />
      <span style={{
        flex: 1, fontSize: 12, color: todo.completed ? 'var(--text-3)' : 'var(--text-2)', lineHeight: 1.4,
        textDecoration: todo.completed ? 'line-through' : 'none',
      }}>
        {todo.text}
      </span>
      <button
        onClick={onDelete}
        style={{
          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: hovered ? 'var(--text-4)' : 'transparent', flexShrink: 0,
          transition: 'color 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = hovered ? 'var(--text-4)' : 'transparent'; }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
