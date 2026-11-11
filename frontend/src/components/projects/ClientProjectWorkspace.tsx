'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Check, Clock3, FolderKanban, ListChecks, Search } from 'lucide-react';
import {
  useProjectMilestones, useProjectWorkItems,
} from '@/hooks/useProjects';
import type { Project, WorkItem } from '@/types/projects';
import { ProjectSupportPanel } from './ProjectSupportPanel';
import { ProjectActivityPanel } from './ProjectActivityPanel';
import { ProjectConversationPanel } from './ProjectConversationPanel';
import { ProjectReportsPanel, ProjectTimelinePanel } from './ProjectInsightsPanel';
import { ProjectDeliveryPanel } from './ProjectDeliveryPanel';
import { ProjectFilesPanel } from './ProjectFilesPanel';
import { ProjectScopePanel } from './ProjectScopePanel';
import { WorkItemProgressBadge } from './WorkItemAdvancedPanel';
import {
  ProjectEmpty, ProjectError, ProjectLoading, ProjectTitleBar, ProjectProgressIndicator, StatePill,
  WORK_STATES, formatProjectDate,
} from './ProjectUI';

type ClientTab = 'overview' | 'work' | 'milestones' | 'files' | 'scope' | 'support' | 'activity' | 'conversation' | 'timeline' | 'reports' | 'delivery';

export function ClientProjectWorkspace({ project }: { project: Project }) {
  const projectId = project.id;
  const itemsQuery = useProjectWorkItems(projectId);
  const milestonesQuery = useProjectMilestones(projectId);
  const [tab, setTab] = useState<ClientTab>('overview');
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('tab');
    if (selected === 'conversation' || selected === 'timeline' || selected === 'reports') {
      setTab(selected);
    }
  }, []);
  const [query, setQuery] = useState('');
  const items = useMemo(() =>
    (itemsQuery.data || []).filter(item => item.visibility === 'client'), [itemsQuery.data]);
  const milestones = milestonesQuery.data || [];
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return items.filter(item =>
      !q || `${item.ref} ${item.title}`.toLowerCase().includes(q)
    );
  }, [items, query]);
  const done = items.filter(item => item.status === 'done').length;
  const progress = items.filter(item => item.status === 'in_progress' || item.status === 'in_review').length;

  function ItemLink({ item }: { item: WorkItem }) {
    return (
      <Link href={`/projects/${projectId}/work-items/${item.id}`}
        className="flex items-center justify-between gap-3 border-b px-3 py-3 transition-colors hover:bg-[var(--bg-hover)]"
        style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="min-w-0">
          <span className="font-mono text-[11px]" style={{ color: 'var(--accent-info-fg)' }}>
            {item.ref}
          </span>
          <div className="mt-1 truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            {item.title}
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {formatProjectDate(item.due_date)}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <WorkItemProgressBadge item={item}/>
          <StatePill value={item.status} label={WORK_STATES.find(s => s.value === item.status)?.label} />
          <ArrowUpRight size={14} style={{ color: 'var(--text-3)' }} />
        </div>
      </Link>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--bg-base)' }}>
      <ProjectTitleBar back="/projects" eyebrow={`Client Portal / ${project.key}`}
        title={project.name} right={<div className="flex flex-wrap items-center gap-2">
          <StatePill value={project.status} />
          <ProjectProgressIndicator indicator={project.status_indicator} />
        </div>} />
      <nav role="tablist" aria-label="Client project views"
        className="flex gap-1 overflow-x-auto border-b px-3"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        {([
          { value: 'overview', label: 'Overview' },
          { value: 'work', label: 'Work Items' },
          { value: 'milestones', label: 'Milestones' },
          { value: 'files', label: 'Files' },
          { value: 'scope', label: 'Scope & Changes' },
          { value: 'support', label: 'Support Tickets' },
          { value: 'activity', label: 'Activity' },
          { value: 'conversation', label: 'Conversation' },
          { value: 'timeline', label: 'Timeline' },
          { value: 'reports', label: 'Reports' },
          { value: 'delivery', label: 'Delivery & Approval' },
        ] as const).map(item => (
          <button key={item.value} type="button" role="tab"
            aria-selected={tab === item.value}
            className="whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium"
            style={{
              borderColor: tab === item.value ? 'var(--accent-info-fg)' : 'transparent',
              color: tab === item.value ? 'var(--text-0)' : 'var(--text-3)',
            }} onClick={() => setTab(item.value)}>{item.label}</button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="w-full min-w-0 space-y-3">
          {itemsQuery.isError && <ProjectError error={itemsQuery.error}
            retry={() => { void itemsQuery.refetch(); }} />}
          {milestonesQuery.isError && <ProjectError error={milestonesQuery.error}
            retry={() => { void milestonesQuery.refetch(); }} />}
          {tab === 'files' && <ProjectFilesPanel project={project}/>}
          {tab === 'scope' && <ProjectScopePanel project={project}/>}
          {tab === 'support' && <ProjectSupportPanel project={project} workItems={items}/>}
          {tab === 'activity' && <ProjectActivityPanel projectId={projectId}/>}
          {tab === 'conversation' && <ProjectConversationPanel project={project}/>}
          {tab === 'timeline' && <ProjectTimelinePanel projectId={projectId}/>}
          {tab === 'reports' && <ProjectReportsPanel projectId={projectId}/>}
          {tab === 'delivery' && <ProjectDeliveryPanel project={project}/>}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {([
                  { name: 'Shared Work Items', value: items.length, Icon: ListChecks },
                  { name: 'In Progress', value: progress, Icon: Clock3 },
                  { name: 'Completed', value: done, Icon: Check },
                ] as const).map(stat => (
                  <div key={stat.name} className="panel p-3">
                    <div className="flex items-center gap-2 text-[11px]"
                      style={{ color: 'var(--text-3)' }}><stat.Icon size={14} /> {stat.name}</div>
                    <div className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-0)' }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="panel p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--text-0)' }}><FolderKanban size={15} /> Project Summary</div>
                <p className="whitespace-pre-wrap text-xs leading-6" style={{ color: 'var(--text-2)' }}>
                  {project.description || 'Your team will share project updates here.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-xs"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
                  <span className="inline-flex items-center gap-1"><CalendarDays size={13} />
                    Target: {formatProjectDate(project.due_date)}
                  </span>
                  <span>{items.length ? Math.round(done / items.length * 100) : 0}% shared work completed</span>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header"><span className="panel-title">Latest Shared Work</span>
                  <button className="text-xs" style={{ color: 'var(--accent-info-fg)' }}
                    onClick={() => setTab('work')}>View all</button>
                </div>
                {itemsQuery.isLoading ? <ProjectLoading /> :
                  items.length === 0 ? <ProjectEmpty title="No shared work yet"
                    description="Client visible work will appear here when it is published." /> :
                  items.slice(0, 6).map(item => <ItemLink item={item} key={item.id} />)}
              </div>
            </>
          )}
          {tab === 'work' && (
            <div className="panel">
              <div className="panel-header flex-wrap gap-2">
                <span className="panel-title">Work Items</span>
                <div className="relative">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-3)' }} />
                  <input className="input w-full pl-8 sm:w-56" value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search shared work" aria-label="Search client work items" />
                </div>
              </div>
              {itemsQuery.isLoading ? <ProjectLoading /> : filtered.length === 0 ?
                <ProjectEmpty title="No work items found"
                  description="Only published client work items appear in this view." /> :
                filtered.map(item => <ItemLink item={item} key={item.id} />)}
            </div>
          )}
          {tab === 'milestones' && (
            milestonesQuery.isLoading ? <ProjectLoading text="Loading milestones…" /> :
            milestones.length === 0 ? <ProjectEmpty title="No milestones yet"
              description="Milestones will appear as your delivery plan develops." /> :
            milestones.map(milestone => {
              const related = items.filter(item => item.milestone_id === milestone.id);
              const completed = related.filter(item => item.status === 'done').length;
              return <section key={milestone.id} className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
                    {milestone.name}
                  </h2>
                  <StatePill value={milestone.status} />
                </div>
                {milestone.description && <p className="mt-2 text-xs"
                  style={{ color: 'var(--text-2)' }}>{milestone.description}</p>}
                <div className="mt-3 flex items-center justify-between text-[11px]"
                  style={{ color: 'var(--text-3)' }}>
                  <span>{completed}/{related.length} shared work items completed</span>
                  <span>{formatProjectDate(milestone.due_date)}</span>
                </div>
                <div className="mt-2 h-1.5" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full" style={{
                    background: 'var(--accent-info-fg)',
                    width: `${related.length ? completed / related.length * 100 : 0}%`,
                  }} />
                </div>
              </section>;
            })
          )}
        </div>
      </div>
    </div>
  );
}
