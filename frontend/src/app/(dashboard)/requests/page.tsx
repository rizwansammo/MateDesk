'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, ChevronLeft, ChevronRight,
  Mail, MailOpen, RefreshCw, Filter, Loader2, User, Building2, Lock,
} from 'lucide-react';
import { getAvatarColor } from '@/lib/utils';
import { useTickets, useUpdateTicket } from '@/hooks/useTickets';
import { useAgents } from '@/hooks/useAgents';
import { useClientOrgs } from '@/hooks/useClientOrgs';
import { useAssignSender } from '@/hooks/useSenders';
import { useGroups } from '@/hooks/useGroups';
import { useAuthStore } from '@/store/useAuthStore';
import type { TicketListItem, TicketStatus, TicketPriority, SupportGroup, SLAStatus } from '@/types/tickets';
import type { ClientOrg } from '@/types/tickets';
import { ApiError } from '@/lib/api';

// ── Config ────────────────────────────────────────────────────────────────────

// Colours come from the semantic accent tokens in globals.css, which carry a
// per-theme pair. These maps previously hardcoded 400-level hex on a 15% tint of
// the same hue — fine on near-black, 1.4-2.1:1 on near-white, so the whole queue
// was untriageable in light mode.

const SLA_CFG: Record<SLAStatus, { label: string; color: string; bg: string }> = {
  not_applied: { label: '—',        color: 'var(--text-3)',           bg: 'transparent'            },
  on_track:    { label: 'On Track', color: 'var(--accent-ok-fg)',     bg: 'var(--accent-ok-bg)'    },
  due_soon:    { label: 'Due Soon', color: 'var(--accent-warn-fg)',   bg: 'var(--accent-warn-bg)'  },
  breached:    { label: 'Breached', color: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)'},
  completed:   { label: 'Met',      color: 'var(--accent-info-fg)',   bg: 'var(--accent-info-bg)'  },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  open:                { label: 'Open',                color: 'var(--accent-info-fg)',    bg: 'var(--accent-info-bg)'    },
  pending:             { label: 'Pending',              color: 'var(--accent-indigo-fg)',  bg: 'var(--accent-indigo-bg)'  },
  in_progress:         { label: 'In Progress',          color: 'var(--accent-warn-fg)',    bg: 'var(--accent-warn-bg)'    },
  waiting_on_customer: { label: 'Waiting on Customer',  color: 'var(--accent-orange-fg)',  bg: 'var(--accent-orange-bg)'  },
  solved:              { label: 'Resolved',             color: 'var(--accent-ok-fg)',      bg: 'var(--accent-ok-bg)'      },
  closed:              { label: 'Closed',               color: 'var(--accent-neutral-fg)', bg: 'var(--accent-neutral-bg)' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'var(--accent-ok-fg)',     bg: 'var(--accent-ok-bg)'     },
  normal:   { label: 'Medium',   color: 'var(--accent-info-fg)',   bg: 'var(--accent-info-bg)'   },
  high:     { label: 'High',     color: 'var(--accent-warn-fg)',   bg: 'var(--accent-warn-bg)'   },
  critical: { label: 'Critical', color: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)' },
};

const VIEW_OPTIONS = [
  { value: '',                   label: 'All Requests'        },
  { value: 'open',               label: 'Open Requests'       },
  { value: 'in_progress',        label: 'In Progress'         },
  { value: 'unassigned',         label: 'Unassigned Requests' },
  { value: 'waiting_on_customer',label: 'Waiting on Customer' },
  { value: 'solved',             label: 'Resolved Requests'   },
  { value: 'closed',             label: 'Closed Requests'     },
  { value: 'pending',            label: 'Waiting for Client'  },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isMSP = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const [view,           setView]           = useState('');
  const [search,         setSearch]         = useState('');
  const [searchInput,    setSearchInput]    = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [orgFilter,      setOrgFilter]      = useState('');
  const [groupFilter,    setGroupFilter]    = useState('');
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [page,           setPage]           = useState(1);
  const [groupPopupState, setGroupPopupState] = useState<{
    ticketRef: string;
    groupId:   string | null;
    pos:       { top: number; left: number };
  } | null>(null);
  const [assignPopup,    setAssignPopup]    = useState<{
    ticketRef:  string;
    assigneeId: string | null;
    groupId:    string | null;
    pos:        { top: number; left: number };
  } | null>(null);
  const [orgPopup, setOrgPopup] = useState<{
    ticketRef:  string;
    fromEmail:  string | null;
    currentOrg: string | null;
    pos:        { top: number; left: number };
  } | null>(null);
  const pageSize = 25;

  const { data: orgs }   = useClientOrgs();
  const { data: groups } = useGroups();

  const { data, isLoading, isError, refetch } = useTickets({
    status:   view          || undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    search:   search        || undefined,
    org_id:   orgFilter     || undefined,
    group_id: groupFilter   || undefined,
    page,
  });

  const tickets    = data?.results ?? [];
  const totalCount = data?.count   ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start      = (page - 1) * pageSize + 1;
  const end        = Math.min(page * pageSize, totalCount);

  function toggleAll() {
    if (selectedIds.size === tickets.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(tickets.map(t => t.id)));
  }
  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const allChecked = tickets.length > 0 && selectedIds.size === tickets.length;

  function handleSearchCommit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  }

  // Detect if filtered org is Walk-In (only Walk-In tickets can have org changed)
  const selectedOrgName = orgs?.find(o => o.id === orgFilter)?.name ?? '';
  const isWalkInFilter  = selectedOrgName === 'Walk-In';

  return (
    <div className="flex flex-col h-full">

      {/* ── Secondary bar ────────────────────────────────────────────────── */}
      <div className="secondary-bar gap-2">

        {/* Status filter */}
        <div className="relative flex-shrink-0">
          <select
            className="select h-7 py-0"
            style={{ minWidth: 160, fontSize: '0.72rem', background: 'var(--bg-card)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
            value={view}
            onChange={e => { setView(e.target.value); setPage(1); setSelectedIds(new Set()); }}
          >
            {VIEW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Organization filter */}
        <div className="relative flex-shrink-0">
          <select
            className="select h-7 py-0"
            style={{ minWidth: 160, fontSize: '0.72rem', background: 'var(--bg-card)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
            value={orgFilter}
            onChange={e => { setOrgFilter(e.target.value); setPage(1); setSelectedIds(new Set()); }}
          >
            <option value="">All Organizations</option>
            {(orgs ?? []).map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-4)' }} />
          <input
            className="input h-7 py-0"
            style={{ width: 200, fontSize: '0.72rem', paddingLeft: 28, background: 'var(--bg-card)', borderColor: 'var(--border-md)' }}
            placeholder="Search tickets… (Enter)"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchCommit}
          />
        </div>

        {/* Priority filter */}
        <div className="relative flex-shrink-0">
          <select
            className="select h-7 py-0"
            style={{ minWidth: 110, fontSize: '0.72rem', background: 'var(--bg-card)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
            value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value as TicketPriority | 'all'); setPage(1); }}
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="normal">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Group filter */}
        <div className="relative flex-shrink-0">
          <select
            className="select h-7 py-0"
            style={{ minWidth: 130, fontSize: '0.72rem', background: 'var(--bg-card)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
            value={groupFilter}
            onChange={e => { setGroupFilter(e.target.value); setPage(1); setSelectedIds(new Set()); }}
          >
            <option value="">All Groups</option>
            {(groups ?? []).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {selectedIds.size > 0 && (
            <span className="px-2 py-1" style={{ fontSize: 11, background: 'rgba(37,99,235,0.2)', color: '#60a5fa' }}>
              {selectedIds.size} selected
            </span>
          )}
          <button
            className="btn-primary gap-1"
            style={{ height: 28, paddingTop: 0, paddingBottom: 0, fontSize: 11 }}
            onClick={() => router.push('/requests/new')}
          >
            <Plus size={12} /> New
          </button>
          <button className="icon-btn w-7 h-7" title="Refresh" onClick={() => refetch()}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--text-4)' }}>
            <span>{totalCount > 0 ? `${start}–${end} of ${totalCount}` : '0'}</span>
            <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ width: 26, height: 26 }}>
              <ChevronLeft size={11} />
            </button>
            <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ width: 26, height: 26 }}>
              <ChevronRight size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: '#2563eb', width: 13, height: 13, cursor: 'pointer' }} />
              </th>
              <th style={{ width: 56, textAlign: 'center' }} />
              <th style={{ width: 140 }}>ID</th>
              <th>Subject</th>
              <th>Requester</th>
              <th>Assigned To</th>
              <th>Level</th>
              <th>Group</th>
              <th>Status</th>
              <th>Created</th>
              <th>Priority</th>
              <th>SLA</th>
              <th>Organization</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={14}>
                  <div className="empty-state py-16">
                    <Loader2 size={28} className="animate-spin" style={{ color: '#2563eb', marginBottom: 8 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading tickets…</p>
                  </div>
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={14}>
                  <div className="empty-state py-16">
                    <p className="empty-state-text" style={{ color: '#f87171' }}>Failed to load tickets</p>
                    <button className="btn-primary mt-3" style={{ fontSize: 11 }} onClick={() => refetch()}>Retry</button>
                  </div>
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={14}>
                  <div className="empty-state py-16">
                    <Filter size={32} style={{ color: 'var(--border-md)', marginBottom: 8 }} />
                    <p className="empty-state-text">No tickets yet</p>
                    <p style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 4 }}>Create your first ticket to get started</p>
                    <button
                      className="btn-primary mt-4 gap-1"
                      style={{ fontSize: 11 }}
                      onClick={() => router.push('/requests/new')}
                    >
                      <Plus size={12} /> Create New Ticket
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              tickets.map(ticket => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  isSelected={selectedIds.has(ticket.id)}
                  onToggle={() => toggleOne(ticket.id)}
                  onNavigate={() => router.push(`/requests/${ticket.ref}`)}
                  onOpenAssign={isMSP
                    ? (ref, assigneeId, pos) => setAssignPopup({ ticketRef: ref, assigneeId, groupId: ticket.group_id, pos })
                    : () => {}}
                  canAssign={isMSP}
                  onOpenOrgChange={isMSP && ticket.client_org === 'Walk-In'
                    ? (ref, fromEmail, currentOrg, pos) =>
                        setOrgPopup({ ticketRef: ref, fromEmail, currentOrg, pos })
                    : undefined}
                  onOpenGroupChange={isMSP
                    ? (ref, groupId, pos) => setGroupPopupState({ ticketRef: ref, groupId, pos })
                    : undefined}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-4)' }}
      >
        <span>{totalCount} total ticket{totalCount !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-1">
          {[...Array(Math.min(totalPages, 7))].map((_, i) => (
            <button
              key={i + 1}
              className={`pagination-btn${page === i + 1 ? ' active' : ''}`}
              style={{ width: 26, height: 26 }}
              onClick={() => setPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          {totalPages > 7 && <span>…</span>}
        </div>
      </div>

      {/* ── Assign agent popup ────────────────────────────────────────────── */}
      {isMSP && assignPopup && (
        <AssignPopup
          ticketRef={assignPopup.ticketRef}
          currentAssigneeId={assignPopup.assigneeId}
          groupId={assignPopup.groupId}
          pos={assignPopup.pos}
          onClose={() => setAssignPopup(null)}
        />
      )}

      {/* ── Change org popup (Walk-In only) ──────────────────────────────── */}
      {isMSP && orgPopup && (
        <OrgChangePopup
          ticketRef={orgPopup.ticketRef}
          fromEmail={orgPopup.fromEmail}
          currentOrg={orgPopup.currentOrg}
          pos={orgPopup.pos}
          orgs={orgs ?? []}
          onClose={() => setOrgPopup(null)}
        />
      )}

      {/* ── Change group popup ────────────────────────────────────────────── */}
      {isMSP && groupPopupState && (
        <GroupPopup
          ticketRef={groupPopupState.ticketRef}
          currentGroupId={groupPopupState.groupId}
          groups={groups ?? []}
          pos={groupPopupState.pos}
          onClose={() => setGroupPopupState(null)}
        />
      )}
    </div>
  );
}

// ── Assign agent popup ────────────────────────────────────────────────────────

function AssignPopup({ ticketRef, currentAssigneeId, groupId, pos, onClose }: {
  ticketRef:          string;
  currentAssigneeId:  string | null;
  groupId:            string | null;
  pos:                { top: number; left: number };
  onClose:            () => void;
}) {
  const [selectedId, setSelectedId] = useState(currentAssigneeId ?? '');
  const { data: agents } = useAgents(groupId);
  const mutation = useUpdateTicket(ticketRef);

  function save(e: React.MouseEvent) {
    e.stopPropagation();
    mutation.mutate(
      { assignee_id: selectedId || null },
      { onSuccess: onClose },
    );
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 100,
          background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          padding: 12, width: 220,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Assign To
        </div>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="select"
          style={{ fontSize: 12, height: 30, paddingTop: 0, paddingBottom: 0 }}
        >
          <option value="">— Unassigned —</option>
          {agents?.map(a => (
            <option key={a.id} value={a.id}>{a.full_name}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <button
            className="btn-primary"
            style={{ flex: 1, height: 26, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
            onClick={save}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1, height: 26, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
            onClick={e => { e.stopPropagation(); onClose(); }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Group popup ───────────────────────────────────────────────────────────────

function GroupPopup({ ticketRef, currentGroupId, groups, pos, onClose }: {
  ticketRef:      string;
  currentGroupId: string | null;
  groups:         SupportGroup[];
  pos:            { top: number; left: number };
  onClose:        () => void;
}) {
  const [selectedId, setSelectedId] = useState(currentGroupId ?? '');
  const mutation = useUpdateTicket(ticketRef);

  function save(e: React.MouseEvent) {
    e.stopPropagation();
    mutation.mutate(
      { group_id: selectedId || null },
      { onSuccess: onClose },
    );
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 100,
          background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          padding: 12, width: 220,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Move to Group
        </div>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="select"
          style={{ fontSize: 12, height: 30, paddingTop: 0, paddingBottom: 0 }}
        >
          <option value="">— No Group —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <button
            className="btn-primary"
            style={{ flex: 1, height: 26, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
            onClick={save}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1, height: 26, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
            onClick={e => { e.stopPropagation(); onClose(); }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Org change popup (Walk-In tickets only) ───────────────────────────────────

type MoveMode = 'ticket' | 'sender';

function OrgChangePopup({ ticketRef, fromEmail, currentOrg, pos, orgs, onClose }: {
  ticketRef:  string;
  fromEmail:  string | null;
  currentOrg: string | null;
  pos:        { top: number; left: number };
  orgs:       ClientOrg[];
  onClose:    () => void;
}) {
  const [selectedOrgId,   setSelectedOrgId]   = useState('');
  const [moveMode,        setMoveMode]        = useState<MoveMode>('ticket');
  const [moveWalkin,      setMoveWalkin]      = useState(true);
  const [error,           setError]           = useState('');

  const updateTicket   = useUpdateTicket(ticketRef);
  const assignSender   = useAssignSender();

  const isPending      = updateTicket.isPending || assignSender.isPending;
  const destOrgs       = orgs.filter(o => o.name !== 'Walk-In');
  const selectedOrgName = destOrgs.find(o => o.id === selectedOrgId)?.name ?? '';
  const hasSenderEmail = !!fromEmail;

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    if (!selectedOrgId) { setError('Please select a destination organization.'); return; }
    setError('');

    if (moveMode === 'ticket') {
      updateTicket.mutate(
        { client_org_id: selectedOrgId },
        { onSuccess: onClose, onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Failed to move ticket.') },
      );
    } else {
      assignSender.mutate(
        { ticket_ref: ticketRef, client_org_id: selectedOrgId, move_walkin_tickets: moveWalkin },
        { onSuccess: onClose, onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Failed to assign sender.') },
      );
    }
  }

  const safeLeft = Math.min(pos.left, window.innerWidth  - 316);
  const safeTop  = Math.min(pos.top,  window.innerHeight - 420);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed', top: safeTop, left: safeLeft, zIndex: 100,
          background: 'var(--bg-surface)', border: '1px solid var(--border-md)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          padding: 14, width: 300,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Change Organization
        </div>

        {/* Sender email badge */}
        {fromEmail && (
          <div style={{ fontSize: 11, color: 'var(--text-4)', background: 'var(--bg-base)', padding: '4px 8px', borderRadius: 3 }}>
            Sender: <span style={{ color: 'var(--text-2)', fontFamily: 'monospace' }}>{fromEmail}</span>
          </div>
        )}

        {/* Destination org */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 4 }}>Move to</div>
          <select
            value={selectedOrgId}
            onChange={e => { setSelectedOrgId(e.target.value); setError(''); }}
            className="select"
            style={{ width: '100%', fontSize: 12, height: 30, paddingTop: 0, paddingBottom: 0 }}
          >
            <option value="">— Select Organization —</option>
            {destOrgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Move mode — only show sender option when ticket has email source */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={moveMode === 'ticket'}
              onChange={() => setMoveMode('ticket')}
              style={{ marginTop: 2, accentColor: '#2563eb' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Move only this ticket</span>
          </label>

          {hasSenderEmail && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                checked={moveMode === 'sender'}
                onChange={() => setMoveMode('sender')}
                style={{ marginTop: 2, accentColor: '#2563eb' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Move all Walk-In tickets from this sender &amp; permanently assign
              </span>
            </label>
          )}
        </div>

        {/* Confirmation block when sender mode is active */}
        {moveMode === 'sender' && selectedOrgId && (
          <div style={{
            padding: '10px 12px', fontSize: 11,
            background: 'rgba(37,99,235,0.08)',
            border: '1px solid rgba(37,99,235,0.2)',
            color: 'var(--text-3)', lineHeight: 1.5,
          }}>
            <p>
              This will permanently associate{' '}
              <strong style={{ color: 'var(--text-1)', fontFamily: 'monospace' }}>{fromEmail}</strong>{' '}
              with <strong style={{ color: 'var(--text-1)' }}>{selectedOrgName}</strong> for all future tickets.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={moveWalkin}
                onChange={e => setMoveWalkin(e.target.checked)}
                style={{ accentColor: '#2563eb' }}
              />
              <span>Also move existing Walk-In tickets from this email</span>
            </label>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-1.5">
          <button
            className="btn-primary"
            style={{ flex: 1, height: 28, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
            onClick={handleSave}
            disabled={isPending || !selectedOrgId}
          >
            {isPending ? 'Saving…' : 'Confirm'}
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1, height: 28, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
            onClick={e => { e.stopPropagation(); onClose(); }}
            disabled={isPending}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function TicketRow({ ticket, isSelected, onToggle, onNavigate, onOpenAssign, canAssign, onOpenOrgChange, onOpenGroupChange }: {
  ticket:             TicketListItem;
  isSelected:         boolean;
  onToggle:           () => void;
  onNavigate:         () => void;
  onOpenAssign:       (ref: string, assigneeId: string | null, pos: { top: number; left: number }) => void;
  canAssign:          boolean;
  onOpenOrgChange?:   (ref: string, fromEmail: string | null, currentOrg: string | null, pos: { top: number; left: number }) => void;
  onOpenGroupChange?: (ref: string, groupId: string | null, pos: { top: number; left: number }) => void;
}) {
  const status   = STATUS_CFG[ticket.status]    ?? STATUS_CFG.open;
  const priority = PRIORITY_CFG[ticket.priority] ?? PRIORITY_CFG.normal;
  const lvl      = ticket.level;
  const lvlColor = !lvl ? 'var(--text-4)' : lvl === 'L3' ? '#f87171' : lvl === 'L2' ? '#a78bfa' : '#60a5fa';
  const isWalkIn = ticket.client_org === 'Walk-In';

  function handleAssignClick(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onOpenAssign(ticket.ref, ticket.assignee_id, { top: rect.bottom + 4, left: rect.left });
  }

  function handleOrgClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onOpenOrgChange) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onOpenOrgChange(ticket.ref, ticket.from_email, ticket.client_org, { top: rect.bottom + 4, left: rect.left });
  }

  function handleGroupClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onOpenGroupChange) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onOpenGroupChange(ticket.ref, ticket.group_id, { top: rect.bottom + 4, left: rect.left });
  }

  return (
    <tr className={isSelected ? 'selected' : ''} style={{ cursor: 'pointer' }} onClick={onNavigate}>
      <td onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={isSelected} onChange={onToggle} style={{ accentColor: '#2563eb', width: 13, height: 13, cursor: 'pointer' }} />
      </td>
      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
        {ticket.status === 'closed' || ticket.status === 'solved'
          ? <Mail size={15} style={{ color: 'var(--text-5)', display: 'inline-block' }} />
          : ticket.last_reply_author_is_agent === true
            ? <MailOpen size={15} style={{ color: '#22c55e', display: 'inline-block' }} />
            : <Mail size={15} style={{ color: '#ef4444', display: 'inline-block' }} />}
      </td>
      <td onClick={e => e.stopPropagation()}>
        <span
          className="font-mono font-bold transition-colors"
          style={{ fontSize: 12, color: 'var(--text-1)', letterSpacing: '0.02em' }}
          onClick={onNavigate}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
        >
          {ticket.ref}
        </span>
      </td>
      <td style={{ maxWidth: 260 }}>
        <span
          className="block truncate font-medium transition-colors"
          style={{ color: 'var(--text-1)', fontSize: 13 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-0)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
        >
          {ticket.subject}
        </span>
      </td>
      <td style={{ maxWidth: 120, color: 'var(--text-2)', fontSize: 13 }}>
        <span className="block truncate">{ticket.requester}</span>
      </td>

      {/* Assigned To */}
      <td style={{ maxWidth: 160 }} onClick={e => e.stopPropagation()}>
        <div
          className="flex items-center gap-1.5"
          style={{ padding: '2px 4px', borderRadius: 3, cursor: canAssign ? 'pointer' : 'default' }}
          onClick={canAssign ? handleAssignClick : undefined}
          onMouseEnter={canAssign ? (e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }) : undefined}
          onMouseLeave={canAssign ? (e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }) : undefined}
        >
          <User size={14} style={{ flexShrink: 0, color: ticket.assignee ? getAvatarColor(ticket.assignee) : 'var(--text-5)' }} />
          {ticket.assignee
            ? <span className="truncate" style={{ color: 'var(--text-2)', fontSize: 13 }}>{ticket.assignee}</span>
            : <span style={{ fontSize: 13, color: 'var(--text-5)', fontStyle: 'italic' }}>Unassigned</span>
          }
        </div>
      </td>

      <td>
        {lvl
          ? <span className="px-1.5 py-0.5 font-semibold" style={{ fontSize: 12, color: lvlColor, background: lvlColor + '18' }}>{lvl}</span>
          : <span style={{ color: 'var(--text-5)', fontSize: 13 }}>—</span>
        }
      </td>

      {/* Group */}
      <td style={{ maxWidth: 130 }} onClick={e => e.stopPropagation()}>
        <div
          className="flex items-center gap-1"
          style={{ padding: '2px 4px', borderRadius: 3, cursor: onOpenGroupChange ? 'pointer' : 'default', display: 'inline-flex' }}
          onClick={onOpenGroupChange ? handleGroupClick : undefined}
          onMouseEnter={onOpenGroupChange ? (e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }) : undefined}
          onMouseLeave={onOpenGroupChange ? (e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }) : undefined}
        >
          {ticket.group_name
            ? <span className="truncate" style={{ fontSize: 13, color: 'var(--text-3)' }}>{ticket.group_name}</span>
            : <span style={{ fontSize: 13, color: 'var(--text-5)', fontStyle: 'italic' }}>—</span>
          }
        </div>
      </td>

      <td>
        <span className="px-2 py-0.5 font-medium" style={{ fontSize: 12, color: status.color, background: status.bg }}>{status.label}</span>
      </td>
      <td style={{ color: 'var(--text-4)', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(ticket.created_at)}</td>
      <td>
        <span className="px-2 py-0.5 font-medium" style={{ fontSize: 12, color: priority.color, background: priority.bg }}>{priority.label}</span>
      </td>

      {/* SLA status */}
      <td>
        {(() => {
          const s = SLA_CFG[ticket.sla_status] ?? SLA_CFG.not_applied;
          if (ticket.sla_status === 'not_applied') {
            return <span style={{ fontSize: 12, color: 'var(--text-5)' }}>—</span>;
          }
          return (
            <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: '2px 7px', whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
          );
        })()}
      </td>

      {/* Organization — clickable for Walk-In tickets (MSP only) */}
      <td style={{ maxWidth: 130 }} onClick={e => e.stopPropagation()}>
        {ticket.is_internal ? (
          <div className="flex items-center gap-1" style={{ display: 'inline-flex' }}>
            <Lock size={10} style={{ color: '#a78bfa', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', background: 'rgba(139,92,246,0.12)', padding: '2px 7px', whiteSpace: 'nowrap' }}>Internal</span>
          </div>
        ) : isWalkIn && onOpenOrgChange ? (
          <div
            className="flex items-center gap-1"
            style={{ padding: '2px 4px', borderRadius: 3, cursor: 'pointer', display: 'inline-flex' }}
            onClick={handleOrgClick}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            title="Click to reassign organization"
          >
            <Building2 size={11} style={{ color: '#fbbf24', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#fbbf24' }}>Walk-In</span>
          </div>
        ) : (
          <span className="block truncate" style={{ color: 'var(--text-4)', fontSize: 13 }}>
            {ticket.client_org ?? '—'}
          </span>
        )}
      </td>
    </tr>
  );
}
