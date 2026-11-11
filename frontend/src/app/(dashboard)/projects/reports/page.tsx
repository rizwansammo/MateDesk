'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useProjectPortfolio } from '@/hooks/useProjectInsights';
import { ProjectError, ProjectLoading } from '@/components/projects/ProjectUI';

export default function ProjectPortfolioPage() {
  const [page, setPage] = useState(1);
  const query = useProjectPortfolio(page);
  const count = query.data?.count || 0;
  const pages = Math.max(1, Math.ceil(count / 25));
  return <main className="h-full overflow-y-auto p-3 md:p-5" style={{ background: 'var(--bg-base)' }}>
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/projects" className="inline-flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--accent-info-fg)' }}><ArrowLeft size={13}/> Projects</Link>
          <h1 className="mt-2 inline-flex items-center gap-2 text-xl font-semibold"
            style={{ color: 'var(--text-0)' }}><BarChart3 size={19}/> Project Portfolio Reports</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Progress across Projects you can access. Client reports use shared work only.
          </p>
        </div>
        <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
          onClick={() => void query.refetch()}><RefreshCw size={13}/> Refresh</button>
      </div>
      <section className="panel">
        <div className="panel-header"><h2 className="panel-title">{count} Accessible Projects</h2></div>
        {query.isLoading ? <ProjectLoading text="Calculating portfolio…"/> :
          query.isError ? <div className="p-3"><ProjectError error={query.error}/></div> :
          !query.data?.results.length ? <p className="p-8 text-center text-xs"
            style={{ color: 'var(--text-3)' }}>No Projects on this page.</p> :
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {query.data.results.map(row => <Link key={row.project_id}
              href={`/projects/${row.project_id}?tab=reports`}
              className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-[var(--bg-hover)]">
              <div className="min-w-[200px] flex-1">
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {row.project_key} · {row.project_status.replaceAll('_', ' ')}
                </span>
                <h3 className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {row.project_name}
                </h3>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Due: {row.due_date || 'Not scheduled'} · {row.work_items.overdue} overdue
                </p>
              </div>
              <div className="min-w-[180px] flex-1">
                <div className="mb-2 flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
                  <span>{row.work_items.done} / {row.work_items.total} Done</span>
                  <span>{row.work_items.completion_percent}%</span>
                </div>
                <div className="h-2" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full" style={{ width: `${row.work_items.completion_percent}%`,
                    background: 'var(--accent-info-fg)' }}/>
                </div>
              </div>
            </Link>)}
          </div>}
        {pages > 1 && <div className="flex justify-between border-t p-3 text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" aria-label="Previous portfolio page"
              disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14}/></button>
            <button type="button" className="btn-secondary" aria-label="Next portfolio page"
              disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14}/></button>
          </div>
        </div>}
      </section>
    </div>
  </main>;
}
