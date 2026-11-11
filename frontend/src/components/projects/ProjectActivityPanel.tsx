'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowUpRight, Bell, CheckCheck, ChevronLeft,
  ChevronRight, RefreshCw,
} from 'lucide-react';
import {
  useProjectActivity, useReadProjectActivity,
} from '@/hooks/useProjectOperations';
import { ProjectError, ProjectLoading } from './ProjectUI';

function activityDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function ProjectActivityPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const feed = useProjectActivity(projectId, page);
  const acknowledge = useReadProjectActivity(projectId);
  const activity = feed.data;
  const totalPages = Math.max(1, Math.ceil((activity?.count ?? 0) / 25));

  return (
    <section className="panel w-full min-w-0">
      <div className="panel-header flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={15} style={{ color: 'var(--accent-info-fg)' }}/>
            <h2 className="panel-title">Project Activity</h2>
            {Boolean(activity?.unread_count) &&
              <span className="px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: 'var(--accent-warn-bg)', color: 'var(--accent-warn-fg)' }}>
                {activity?.unread_count} need attention
              </span>}
          </div>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            A shared activity timeline with current visibility and client permissions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/projects/notifications" className="btn-secondary inline-flex items-center gap-1 text-xs">
            <Bell size={13}/> Notifications
          </Link>
          {Boolean(activity?.unread_count) &&
            <button type="button" className="btn-primary gap-1.5" disabled={acknowledge.isPending}
              onClick={() => acknowledge.mutate()}>
              <CheckCheck size={14}/>
              {acknowledge.isPending ? 'Saving…' : 'Mark Reviewed'}
            </button>}
          <button type="button" className="icon-btn" title="Refresh Activity"
            aria-label="Refresh Project Activity" onClick={() => { void feed.refetch(); }}>
            <RefreshCw size={15} className={feed.isFetching ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>
      {acknowledge.error && <div className="p-3"><ProjectError error={acknowledge.error}/></div>}
      {feed.isLoading ? <ProjectLoading text="Loading Project Activity…"/> :
        feed.isError ? <div className="p-3"><ProjectError error={feed.error}
          retry={() => { void feed.refetch(); }}/></div> :
        !activity || activity.results.length === 0 ? (
          <div className="px-3 py-12 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            {page > 1 ? 'No more activity on this page.' : 'Project updates, client feedback and support will appear here.'}
          </div>
        ) : (
          <ol className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {activity.results.map(item => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center border"
                  style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}>
                  <Activity size={14}/>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>
                      {item.actor}{item.is_mine ? ' · You' : ''}
                    </span>
                    <time className="shrink-0 text-[11px]" dateTime={item.created_at}
                      style={{ color: 'var(--text-3)' }}>{activityDate(item.created_at)}</time>
                  </div>
                  <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                    style={{ color: 'var(--text-1)' }}>{item.summary}<ArrowUpRight size={12}/></Link>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {item.visibility === 'internal' ? 'Staff Only' : 'Shared With Client'}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      {totalPages > 1 && <div className="flex items-center justify-between border-t px-3 py-2 text-xs"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
        <span>{activity?.count ?? 0} activities · Page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <button className="pagination-btn" type="button" disabled={page <= 1}
            aria-label="Previous activity page" onClick={() => setPage(value => Math.max(1, value - 1))}>
            <ChevronLeft size={14}/>
          </button>
          <button className="pagination-btn" type="button" disabled={page >= totalPages}
            aria-label="Next activity page" onClick={() => setPage(value => value + 1)}>
            <ChevronRight size={14}/>
          </button>
        </div>
      </div>}
    </section>
  );
}
