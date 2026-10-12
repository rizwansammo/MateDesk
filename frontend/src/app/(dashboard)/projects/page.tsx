'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, FolderKanban, Layers, Plus, Search, ShieldCheck, Users } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/store/useAuthStore';
import type { Project, ProjectStatus } from '@/types/projects';
import { CreateProjectDialog } from '@/components/projects/ProjectForms';
import { AgentProjectAccessDialog } from '@/components/projects/AgentProjectAccessDialog';
import { useProjectCapabilities } from '@/hooks/useProjectRequests';
import { ClientProjectsOverview } from '@/components/projects/ClientProjectsOverview';
import { ProjectEmpty, ProjectError, ProjectLoading, ProjectTitleBar, ProjectProgressIndicator, StatePill, formatProjectDate } from '@/components/projects/ProjectUI';

const STATUSES: { value: ProjectStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Projects' },
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const isStaff = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');
  const { data: capabilities } = useProjectCapabilities();
  const canCreate = Boolean(capabilities?.can_create_projects);
  const { data: projects = [], isLoading, isError, error, refetch } = useProjects();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const stats = useMemo(() => ({
    all: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    planned: projects.filter(p => p.status === 'planned').length,
    completed: projects.filter(p => p.status === 'completed').length,
  }), [projects]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(project =>
      (status === 'all' || project.status === status) &&
      (!q || [project.name, project.key, project.client_org_name].some(text => text.toLowerCase().includes(q)))
    );
  }, [projects, query, status]);

  if (!isStaff) return (
    <ClientProjectsOverview projects={projects} isLoading={isLoading} error={error}
      retry={() => { void refetch(); }} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--bg-base)' }}>
      <ProjectTitleBar title="Projects" eyebrow="Workspace"
        right={<div className="flex flex-wrap items-center gap-2">
          {capabilities?.can_manage_agent_permissions && <button className="btn-secondary" onClick={() => setAccessOpen(true)}>
            Agent Project Access
          </button>}
          {canCreate && <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> New Project
          </button>}
        </div>} />
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {([
              { name: 'Total Projects', count: stats.all, Icon: FolderKanban, tint: 'var(--accent-info-fg)' },
              { name: 'Active', count: stats.active, Icon: Layers, tint: 'var(--accent-ok-fg)' },
              { name: 'Planned', count: stats.planned, Icon: CalendarDays, tint: 'var(--accent-indigo-fg)' },
              { name: 'Completed', count: stats.completed, Icon: ShieldCheck, tint: 'var(--accent-ok-fg)' },
            ] as const).map(({ name, count, Icon, tint }) => (
              <div key={name} className="panel flex items-center gap-3 px-3 py-3">
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center" style={{ background: 'var(--bg-elevated)', color: tint }}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className="text-xl font-semibold leading-tight" style={{ color: 'var(--text-0)' }}>{count}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{name}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--border-md)' }}>
              <div className="flex items-center gap-2">
                <FolderKanban size={14} style={{ color: 'var(--text-3)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Project Directory</span>
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{filtered.length}</span>
              </div>
              <div className="flex-1" />
              <div className="relative min-w-[180px] flex-1 sm:flex-none">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-3)' }} />
                <input aria-label="Search projects" className="input w-full pl-8 sm:w-56" placeholder="Search projects"
                  value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <select aria-label="Filter project status" className="select w-auto min-w-[125px]"
                value={status} onChange={e => setStatus(e.target.value as ProjectStatus | 'all')}>
                {STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            {isError ? <div className="p-3"><ProjectError error={error} retry={() => { void refetch(); }} /></div>
              : isLoading ? <ProjectLoading />
                : filtered.length === 0 ? (
                  <ProjectEmpty title={projects.length ? 'No matching projects' : 'No projects yet'}
                    description={projects.length ? 'Adjust the search or status filter.' : 'Create a project to organize delivery for a client.'}
                    action={!projects.length && canCreate && <button className="btn-primary mt-2" onClick={() => setCreateOpen(true)}><Plus size={13} /> Create Project</button>} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table w-full">
                      <thead><tr>
                        <th>Project</th><th>Client</th><th>Status</th><th>Visibility</th><th>Due Date</th><th aria-label="Open" />
                      </tr></thead>
                      <tbody>
                        {filtered.map((project: Project) => (
                          <tr key={project.id}>
                            <td>
                              <Link href={`/projects/${project.id}`} className="flex min-w-[200px] items-center gap-2.5 py-0.5">
                                <span className="grid h-8 w-8 flex-shrink-0 place-items-center"
                                  style={{ background: 'var(--accent-info-bg)', color: 'var(--accent-info-fg)' }}>
                                  <FolderKanban size={15} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-semibold" style={{ color: 'var(--text-0)' }}>{project.name}</span>
                                  <span className="block text-[11px] font-mono" style={{ color: 'var(--text-3)' }}>{project.key}</span>
                                </span>
                              </Link>
                            </td>
                            <td><span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
                              <Users size={13} /> {project.client_org_name}</span></td>
                            <td><span className="flex flex-wrap items-center gap-1.5">
                              <StatePill value={project.status} />
                              <ProjectProgressIndicator indicator={project.status_indicator} />
                            </span></td>
                            <td><span className="text-xs" style={{ color: 'var(--text-3)' }}>{project.visibility === 'client' ? 'Client Visible' : 'Internal'}</span></td>
                            <td><span className="text-xs" style={{ color: 'var(--text-3)' }}>{formatProjectDate(project.due_date)}</span></td>
                            <td className="text-right"><Link aria-label={`Open ${project.name}`} href={`/projects/${project.id}`}
                              className="inline-flex items-center" style={{ color: 'var(--text-3)' }}><ChevronRight size={15} /></Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Support Requests remain separate from Project Work Items.
          </p>
        </div>
      </div>
      {createOpen && <CreateProjectDialog onClose={() => setCreateOpen(false)} />}
      {accessOpen && <AgentProjectAccessDialog onClose={() => setAccessOpen(false)} />}
    </div>
  );
}
