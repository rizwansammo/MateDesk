'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useProjectNotificationInbox, useReviewProjectNotifications } from '@/hooks/useProjectCommunication';
import { ProjectError, ProjectLoading } from '@/components/projects/ProjectUI';

export default function ProjectNotificationInboxPage() {
  const [page, setPage] = useState(1);
  const feed = useProjectNotificationInbox(page);
  const review = useReviewProjectNotifications();
  const data = feed.data;
  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / 25));

  return <main className="h-full overflow-y-auto p-3 md:p-5" style={{ background: 'var(--bg-base)' }}>
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/projects" className="text-xs hover:underline" style={{ color: 'var(--accent-info-fg)' }}>Projects</Link>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold"
            style={{ color: 'var(--text-0)' }}><Bell size={20}/> Project Notifications</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Updates needing your attention across projects you can access.
          </p>
        </div>
        <button type="button" className="btn-secondary flex items-center gap-1"
          onClick={() => void feed.refetch()}><RefreshCw size={13}/> Refresh</button>
      </div>
      {review.error && <ProjectError error={review.error}/>}
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Attention Inbox</h2>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{data?.unread_count ?? 0} unread</span>
        </div>
        {feed.isLoading ? <ProjectLoading text="Loading notifications…"/> :
          feed.isError ? <div className="p-3"><ProjectError error={feed.error}
            retry={() => void feed.refetch()}/></div> :
          !data?.results.length ? <p className="p-8 text-center text-xs"
            style={{ color: 'var(--text-3)' }}>No project notifications.</p> :
          <ol className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {data.results.map(item => <li key={item.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px]"
                  style={{ color: 'var(--text-3)' }}>
                  {item.is_unread && <span className="font-semibold"
                    style={{ color: 'var(--accent-info-fg)' }}>Unread</span>}
                  <span>{item.project_key} · {item.project_name}</span>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                <Link href={item.href} className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  style={{ color: 'var(--text-1)' }}>{item.summary}<ArrowUpRight size={13}/></Link>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>From {item.actor}</p>
              </div>
              {item.is_unread && <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
                disabled={review.isPending} onClick={() => review.mutate(item.project_id)}>
                <CheckCheck size={13}/> Review Project
              </button>}
            </li>)}
          </ol>}
        {totalPages > 1 && <div className="flex items-center justify-between border-t p-3 text-xs"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="icon-btn" aria-label="Previous notification page" disabled={page <= 1}
              onClick={() => setPage(n => n - 1)}><ChevronLeft size={14}/></button>
            <button className="icon-btn" aria-label="Next notification page" disabled={page >= totalPages}
              onClick={() => setPage(n => n + 1)}><ChevronRight size={14}/></button>
          </div>
        </div>}
      </section>
    </div>
  </main>;
}
