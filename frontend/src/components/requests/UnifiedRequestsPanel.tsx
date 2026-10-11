'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, ClipboardList, FolderKanban, Plus,
  RefreshCw, Search, Ticket, ArrowUpRight, SlidersHorizontal, CircleDot, UserRound,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useWorkQueue } from '@/hooks/useProjectRequests';
import type { WorkQueueFilter, WorkQueueKind } from '@/types/projectRequests';

const FILTERS: { value: WorkQueueFilter; label: string }[] = [
  { value: 'all', label: 'All Work' },
  { value: 'tickets', label: 'Support Tickets' },
  { value: 'project_requests', label: 'Project Requests' },
  { value: 'projects', label: 'Projects' },
];

const KIND_CFG: Record<WorkQueueKind, { label: string; Icon: typeof Ticket; color: string }> = {
  ticket: { label: 'Support Ticket', Icon: Ticket, color: 'var(--accent-info-fg)' },
  project_request: { label: 'Project Request', Icon: ClipboardList, color: 'var(--accent-warn-fg)' },
  project: { label: 'Project', Icon: FolderKanban, color: 'var(--accent-indigo-fg)' },
};

function formattedStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
}
function dateDisplay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function UnifiedRequestsPanel({ onTicketTools }: { onTicketTools: () => void }) {
  const user = useAuthStore(state => state.user);
  const isStaff = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');
  const [kind, setKind] = useState<WorkQueueFilter>('all');
  const [scope, setScope] = useState<'all' | 'attention' | 'mine'>('all');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch } = useWorkQueue(kind, page, search, scope);
  const rows = data?.results ?? [];
  const count = data?.count ?? 0;
  const maxPage = Math.max(1, Math.ceil(count / 25));

  function changeKind(next: WorkQueueFilter) {
    setKind(next);
    setPage(1);
  }
  function commitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--bg-base)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3 md:px-4"
        style={{ borderColor: 'var(--border-md)', background: 'var(--bg-surface)' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-0)' }}>Requests</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Support Tickets, Project Requests and Projects in one workspace
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStaff ? (
            <Link className="btn-primary inline-flex items-center gap-1.5 text-xs" href="/requests/new">
              <Plus size={14}/> New Ticket
            </Link>
          ) : (
            <>
              <Link href="/requests/new" className="btn-secondary inline-flex items-center gap-1.5 text-xs">
                <Plus size={14}/> New Ticket
              </Link>
              <Link className="btn-primary inline-flex items-center gap-1.5 text-xs"
                href="/requests/project/new"><FolderKanban size={14}/> Request Project</Link>
            </>
          )}
          {isStaff && <Link href="/projects" className="btn-secondary inline-flex items-center gap-1.5 text-xs">
            <FolderKanban size={14}/> Projects
          </Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {FILTERS.map(filter => (
            <button type="button" key={filter.value}
              className="shrink-0 border px-3 py-1.5 text-xs font-medium transition-colors"
              onClick={() => changeKind(filter.value)}
              aria-pressed={kind === filter.value}
              style={{
                borderColor: kind === filter.value ? 'var(--accent-info-fg)' : 'var(--border-subtle)',
                background: kind === filter.value ? 'var(--accent-info-bg)' : 'var(--bg-card)',
                color: kind === filter.value ? 'var(--accent-info-fg)' : 'var(--text-2)',
              }}>
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={scope === 'all'} className="btn-secondary gap-1"
            style={{ color: scope === 'all' ? 'var(--accent-info-fg)' : undefined }}
            onClick={() => { setScope('all'); setPage(1); }}>All</button>
          <button type="button" aria-pressed={scope === 'attention'} className="btn-secondary gap-1"
            style={{ color: scope === 'attention' ? 'var(--accent-warn-fg)' : undefined }}
            onClick={() => { setScope('attention'); setPage(1); }}>
            <CircleDot size={13}/> Needs Attention
          </button>
          {isStaff && <button type="button" aria-pressed={scope === 'mine'} className="btn-secondary gap-1"
            style={{ color: scope === 'mine' ? 'var(--accent-info-fg)' : undefined }}
            onClick={() => { setScope('mine'); setPage(1); }}>
            <UserRound size={13}/> Assigned to Me
          </button>}
          <form onSubmit={commitSearch} className="flex items-center gap-1">
            <input className="input w-[170px] py-1.5 text-xs sm:w-[215px]"
              aria-label="Search all Requests" value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="Search requests or clients"/>
            <button type="submit" className="icon-btn" title="Search" aria-label="Search"><Search size={15}/></button>
          </form>
          <button type="button" className="icon-btn" title="Refresh" aria-label="Refresh"
            onClick={() => { void refetch(); }}><RefreshCw size={15} className={isLoading ? 'animate-spin' : ''}/></button>
          <button type="button" onClick={onTicketTools}
            className="btn-secondary inline-flex items-center gap-1 text-xs">
            <SlidersHorizontal size={13}/> Ticket Tools
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="data-table w-full">
          <thead className="sticky top-0 z-10"><tr>
            <th style={{ width: 120 }}>Type</th>
            <th style={{ width: 125 }}>Reference</th>
            <th>Subject</th>
            <th>Client</th>
            <th>Assigned To</th>
            <th>Status</th>
            <th style={{ width: 140 }}>Updated</th>
            <th aria-label="Open" style={{ width: 36 }} />
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="p-6 text-center text-xs">Loading requests…</td></tr> :
              isError ? <tr><td colSpan={8} className="p-6 text-center text-xs">
                <p role="alert" style={{ color: 'var(--accent-danger-fg)' }}>{error?.message || 'Unable to load Requests'}</p>
                <button type="button" className="btn-secondary mt-2" onClick={() => { void refetch(); }}>Retry</button>
              </td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-xs"
                  style={{ color: 'var(--text-3)' }}>No matching requests or projects.</td></tr> :
              rows.map(item => {
                const cfg = KIND_CFG[item.kind];
                return (
                  <tr key={item.kind + ':' + item.id}>
                    <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]"
                      style={{ color: cfg.color }}><cfg.Icon size={13}/>{cfg.label}</span></td>
                    <td><span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{item.ref}</span></td>
                    <td className="max-w-[380px]">
                      <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                        style={{ color: 'var(--text-0)' }}>
                        <span className="truncate">{item.title}</span>
                        {item.needs_attention && <CircleDot size={13} className="shrink-0"
                          aria-label="Needs Attention" style={{ color: 'var(--accent-warn-fg)' }}/>}
                        <ArrowUpRight size={12} className="shrink-0" style={{ color: 'var(--text-3)' }}/>
                      </Link>
                      {item.kind === 'ticket' && item.project_key && (
                        <span className="ml-2 text-[11px]" style={{ color: 'var(--accent-indigo-fg)' }}>
                          · {item.project_key}
                        </span>
                      )}
                    </td>
                    <td><span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-2)' }}>{item.client_org || '—'}</span></td>
                    <td><span className="whitespace-nowrap text-xs" style={{ color: item.assigned_to_me ? 'var(--accent-info-fg)' : 'var(--text-3)' }}>
                      {item.assigned_to || '—'}</span></td>
                    <td><span className="whitespace-nowrap text-[11px] font-medium"
                      style={{ color: ['approved', 'completed', 'solved', 'converted'].includes(item.status)
                        ? 'var(--accent-ok-fg)' : ['submitted', 'awaiting_details', 'pending'].includes(item.status)
                          ? 'var(--accent-warn-fg)' : 'var(--text-2)' }}>
                      {formattedStatus(item.status)}
                    </span></td>
                    <td><span className="whitespace-nowrap text-[11px]" style={{ color: 'var(--text-3)' }}>{dateDisplay(item.updated_at)}</span></td>
                    <td><Link href={item.href} aria-label={'Open ' + item.title}
                      style={{ color: 'var(--text-3)' }}><ChevronRight size={15}/></Link></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)', background: 'var(--bg-surface)' }}>
        <span>{count} items · Page {page} of {maxPage}</span>
        <div className="flex items-center gap-1">
          <button type="button" className="pagination-btn" disabled={page <= 1}
            onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="Previous page">
            <ChevronLeft size={14}/>
          </button>
          <button type="button" className="pagination-btn" disabled={page >= maxPage}
            onClick={() => setPage(value => value + 1)} aria-label="Next page">
            <ChevronRight size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}
