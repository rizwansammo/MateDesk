'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, CheckCircle2, FolderKanban, Search } from 'lucide-react';
import type { Project } from '@/types/projects';
import {
  ProjectEmpty, ProjectError, ProjectLoading, ProjectTitleBar, StatePill, formatProjectDate,
} from './ProjectUI';

export function ClientProjectsOverview({
  projects, isLoading, error, retry,
}: {
  projects: Project[];
  isLoading: boolean;
  error: unknown;
  retry: () => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(p =>
      p.my_role === 'client_reviewer' && p.visibility === 'client'
      && (!q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
    );
  }, [projects, query]);

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--bg-base)' }}>
      <ProjectTitleBar eyebrow="Client Portal" title="My Projects" />
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto max-w-[1200px] space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="panel p-4">
              <div className="mb-2 flex items-center gap-2" style={{ color: 'var(--accent-info-fg)' }}>
                <FolderKanban size={17} /> Projects
              </div>
              <div className="text-2xl font-semibold" style={{ color: 'var(--text-0)' }}>{visible.length}</div>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Shared with you</p>
            </div>
            <div className="panel p-4">
              <div className="mb-2 flex items-center gap-2" style={{ color: 'var(--accent-ok-fg)' }}>
                <CheckCircle2 size={17} /> Completed
              </div>
              <div className="text-2xl font-semibold" style={{ color: 'var(--text-0)' }}>
                {visible.filter(project => project.status === 'completed').length}
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Project deliveries</p>
            </div>
          </div>
          <div className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3"
              style={{ borderColor: 'var(--border-md)' }}>
              <div className="flex items-center gap-2">
                <FolderKanban size={14} style={{ color: 'var(--accent-info-fg)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
                  Shared Projects
                </span>
              </div>
              <div className="relative w-full sm:w-auto">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-3)' }} />
                <input className="input w-full pl-8 sm:w-56" value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search projects" aria-label="Search shared projects" />
              </div>
            </div>
            {error ? <div className="p-3"><ProjectError error={error} retry={retry} /></div> :
              isLoading ? <ProjectLoading text="Loading shared projects…" /> :
              visible.length === 0 ?
                <ProjectEmpty title="No shared projects"
                  description={query ? 'No projects match your search.' :
                    'Your support team will share client visible projects with you when they are ready.'} /> :
              <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
                {visible.map(project => (
                  <Link href={`/projects/${project.id}`} key={project.id}
                    className="flex flex-col gap-3 border p-3 transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-md)', background: 'var(--bg-card)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {project.key}
                        </span>
                        <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
                          {project.name}
                        </div>
                      </div>
                      <ArrowUpRight size={15} style={{ color: 'var(--accent-info-fg)' }} />
                    </div>
                    {project.description && <p className="line-clamp-2 text-xs"
                      style={{ color: 'var(--text-2)' }}>{project.description}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                      style={{ borderColor: 'var(--border-subtle)' }}>
                      <StatePill value={project.status} />
                      <span className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: 'var(--text-3)' }}>
                        <CalendarDays size={12} /> {formatProjectDate(project.due_date)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
