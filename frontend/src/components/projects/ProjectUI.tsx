'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AlertCircle, ArrowLeft, FolderKanban, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import type { ProjectStatus, WorkItemKind, WorkItemPriority, WorkItemStatus } from '@/types/projects';

export const PROJECT_STATES: { value: ProjectStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];
export const WORK_STATES: { value: WorkItemStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];
export const WORK_KINDS: { value: WorkItemKind; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'improvement', label: 'Improvement' },
];
export const WORK_PRIORITIES: { value: WorkItemPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const COLORS: Record<string, { fg: string; bg: string }> = {
  planned: { fg: 'var(--text-3)', bg: 'var(--bg-elevated)' },
  backlog: { fg: 'var(--text-3)', bg: 'var(--bg-elevated)' },
  todo: { fg: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)' },
  active: { fg: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)' },
  in_progress: { fg: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
  on_hold: { fg: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
  in_review: { fg: 'var(--accent-indigo-fg)', bg: 'var(--accent-indigo-bg)' },
  completed: { fg: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
  done: { fg: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
  urgent: { fg: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)' },
  high: { fg: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
  normal: { fg: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)' },
  low: { fg: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
  archived: { fg: 'var(--text-3)', bg: 'var(--bg-elevated)' },
  cancelled: { fg: 'var(--text-3)', bg: 'var(--bg-elevated)' },
  bug: { fg: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)' },
  task: { fg: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)' },
  feature: { fg: 'var(--accent-indigo-fg)', bg: 'var(--accent-indigo-bg)' },
  improvement: { fg: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
  internal: { fg: 'var(--text-3)', bg: 'var(--bg-elevated)' },
  client: { fg: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
};

export function StatePill({ value, label }: { value: string; label?: string }) {
  const token = COLORS[value] ?? COLORS.planned;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: token.bg, color: token.fg }}>
      {label ?? value.replace(/_/g, ' ')}
    </span>
  );
}
export function ProjectTitleBar({ title, eyebrow, back, right }: {
  title: string; eyebrow?: string; back?: string; right?: ReactNode;
}) {
  return (
    <header className="flex min-h-[54px] flex-wrap items-center gap-3 px-4 py-2 border-b"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      {back ? (
        <Link href={back} aria-label="Back" className="icon-btn flex-shrink-0"><ArrowLeft size={16} /></Link>
      ) : <FolderKanban size={17} style={{ color: 'var(--accent-info-fg)' }} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {eyebrow && <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{eyebrow}</span>}
        <h1 className="truncate text-sm font-semibold" style={{ color: 'var(--text-0)' }}>{title}</h1>
      </div>
      {right}
    </header>
  );
}
export function ProjectLoading({ text = 'Loading projects…' }: { text?: string }) {
  return <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-xs"
    style={{ color: 'var(--text-3)' }} role="status"><Loader2 size={20} className="animate-spin" />{text}</div>;
}
export function ProjectEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border p-8 text-center"
      style={{ borderColor: 'var(--border-md)', background: 'var(--bg-card)' }}>
      <FolderKanban size={24} style={{ color: 'var(--text-3)' }} />
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h2>
      <p className="max-w-sm text-xs" style={{ color: 'var(--text-3)' }}>{description}</p>
      {action}
    </div>
  );
}
export function ProjectError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border px-3 py-2 text-xs"
      style={{ background: 'var(--accent-danger-bg)', borderColor: 'var(--accent-danger-fg)', color: 'var(--accent-danger-fg)' }}>
      <AlertCircle size={15} />
      <span className="flex-1">{error instanceof Error ? error.message : 'Something went wrong. Please try again.'}</span>
      {retry && <button className="btn-secondary" onClick={retry}>Retry</button>}
    </div>
  );
}
export function ProjectDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-lg border shadow-2xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-strong)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-md)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </section>
    </div>
  );
}
export function formatProjectDate(date: string | null | undefined) {
  if (!date) return 'Not set';
  const parts = date.slice(0, 10).split('-').map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(dt.getTime()) ? 'Not set' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
