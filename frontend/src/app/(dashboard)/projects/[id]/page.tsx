'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CalendarDays, Check, ChevronRight, Clock3, Columns3, FolderKanban,
  LayoutList, ListChecks, Plus, Search, Settings2, Shield, Trash2, Users, LifeBuoy, Activity, ClipboardCheck, Files, FilePenLine, MessageSquare,
} from 'lucide-react';
import {
  useProject, useProjectMembers, useProjectMilestones, useProjectWorkItems,
  useRemoveProjectMember, useUpdateMilestone, useUpdateWorkItem,
} from '@/hooks/useProjects';
import type { ProjectMilestone, WorkItem, WorkItemKind, WorkItemPriority, WorkItemStatus } from '@/types/projects';
import {
  AddProjectMemberDialog, CreateMilestoneDialog, CreateWorkItemDialog, EditProjectDialog,
} from '@/components/projects/ProjectForms';
import { ProjectReviewerDialog } from '@/components/projects/ProjectReviewerDialog';
import { ClientProjectWorkspace } from '@/components/projects/ClientProjectWorkspace';
import { ProjectSupportPanel } from '@/components/projects/ProjectSupportPanel';
import { ProjectActivityPanel } from '@/components/projects/ProjectActivityPanel';
import { ProjectConversationPanel } from '@/components/projects/ProjectConversationPanel';
import { ProjectTimePanel } from '@/components/projects/ProjectTimePanel';
import { ProjectDeliveryPanel } from '@/components/projects/ProjectDeliveryPanel';
import { ProjectFilesPanel } from '@/components/projects/ProjectFilesPanel';
import { ProjectScopePanel } from '@/components/projects/ProjectScopePanel';
import { WorkItemProgressBadge } from '@/components/projects/WorkItemAdvancedPanel';
import {
  ProjectEmpty, ProjectError, ProjectLoading, ProjectTitleBar, ProjectProgressIndicator, StatePill,
  WORK_STATES, WORK_KINDS, WORK_PRIORITIES, formatProjectDate,
} from '@/components/projects/ProjectUI';

type Tab = 'overview' | 'board' | 'list' | 'milestones' | 'files' | 'scope' | 'support' | 'activity' | 'conversation' | 'time' | 'delivery' | 'team';
type KindFilter = WorkItemKind | 'all';
type PriorityFilter = WorkItemPriority | 'all';

function Stat({ label, count, Icon }: { label: string; count: number; Icon: typeof ListChecks }) {
  return (
    <div className="panel flex items-center gap-3 px-3 py-3">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center"
        style={{ color: 'var(--accent-info-fg)', background: 'var(--accent-info-bg)' }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-semibold leading-tight" style={{ color: 'var(--text-0)' }}>{count}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</div>
      </div>
    </div>
  );
}

function WorkLink({ item, projectId }: { item: WorkItem; projectId: string }) {
  return <Link href={`/projects/${projectId}/work-items/${item.id}`} className="flex min-w-0 flex-col gap-1 py-0.5">
    <span className="truncate text-xs font-semibold" style={{ color: 'var(--text-0)' }}>{item.title}</span>
    <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{item.ref}</span>
    <WorkItemProgressBadge item={item}/>
  </Link>;
}

function WorkRow({ item, projectId, canEdit, move, busy }: {
  item: WorkItem; projectId: string; canEdit: boolean; move: (id: string, status: WorkItemStatus) => void; busy: boolean;
}) {
  return (
    <tr>
      <td><WorkLink item={item} projectId={projectId} /></td>
      <td><StatePill value={item.kind} /></td>
      <td>
        {canEdit ? (
          <select aria-label={`Status for ${item.ref}`} className="select max-w-[146px] min-w-[116px]"
            value={item.status} disabled={busy} onChange={e => move(item.id, e.target.value as WorkItemStatus)}>
            {WORK_STATES.map(s => <option key={s.value} value={s.value}
              disabled={(item.is_blocked && ['in_progress','in_review','done'].includes(s.value))
                || (s.value === 'done' && item.checklist_total > item.checklist_completed)}>{s.label}</option>)}
          </select>
        ) : <StatePill value={item.status} label={WORK_STATES.find(s => s.value === item.status)?.label} />}
      </td>
      <td><StatePill value={item.priority} /></td>
      <td><span className="text-xs" style={{ color: 'var(--text-2)' }}>{item.assignee_name || 'Unassigned'}</span></td>
      <td><span className="text-xs" style={{ color: 'var(--text-3)' }}>{formatProjectDate(item.due_date)}</span></td>
    </tr>
  );
}

function WorkCard({ item, projectId, canEdit, move, busy, startDrag, finishDrag }: {
  item: WorkItem; projectId: string; canEdit: boolean;
  move: (id: string, status: WorkItemStatus) => void; busy: boolean;
  startDrag: (e: DragEvent<HTMLDivElement>, id: string) => void; finishDrag: () => void;
}) {
  return (
    <div className="border p-3 transition-colors hover:border-[var(--border-strong)]"
      draggable={canEdit && !busy} onDragStart={e => startDrag(e, item.id)} onDragEnd={finishDrag}
      style={{ borderColor: 'var(--border-md)', background: 'var(--bg-card)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{item.ref}</span>
        <StatePill value={item.priority} />
      </div>
      <Link href={`/projects/${projectId}/work-items/${item.id}`} className="block text-[13px] font-semibold leading-snug"
        style={{ color: 'var(--text-0)' }}>{item.title}</Link>
      <div className="mt-2"><WorkItemProgressBadge item={item}/></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <StatePill value={item.kind} />
        <span className="max-w-[120px] truncate text-[11px]" title={item.assignee_name || 'Unassigned'}
          style={{ color: 'var(--text-3)' }}>{item.assignee_name || 'Unassigned'}</span>
      </div>
      {canEdit && <select className="select mt-2 w-full" aria-label={`Move ${item.ref}`}
        disabled={busy} value={item.status} onChange={e => move(item.id, e.target.value as WorkItemStatus)}>
        {WORK_STATES.map(s => <option key={s.value} value={s.value}
              disabled={(item.is_blocked && ['in_progress','in_review','done'].includes(s.value))
                || (s.value === 'done' && item.checklist_total > item.checklist_completed)}>Move to {s.label}</option>)}
      </select>}
    </div>
  );
}

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const projectQuery = useProject(projectId);
  const project = projectQuery.data;
  const canManage = Boolean(project?.can_manage);
  const canEdit = Boolean(project?.can_edit);
  const itemsQuery = useProjectWorkItems(projectId);
  const milestonesQuery = useProjectMilestones(projectId);
  const membersQuery = useProjectMembers(projectId, canManage);
  const patchItem = useUpdateWorkItem(projectId);
  const patchMilestone = useUpdateMilestone(projectId);
  const removeMember = useRemoveProjectMember(projectId);

  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'conversation') setTab('conversation');
  }, []);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [showNewWork, setShowNewWork] = useState(false);
  const [showNewMilestone, setShowNewMilestone] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddReviewer, setShowAddReviewer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const items = itemsQuery.data ?? [];
  const milestones = milestonesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter(i =>
      (kind === 'all' || i.kind === kind) &&
      (priority === 'all' || i.priority === priority) &&
      (!q || [i.title, i.ref, i.description].some(text => text.toLowerCase().includes(q)))
    );
  }, [items, kind, priority, search]);
  const overview = useMemo(() => ({
    total: items.length,
    progress: items.filter(i => i.status === 'in_progress' || i.status === 'in_review').length,
    done: items.filter(i => i.status === 'done').length,
    bugs: items.filter(i => i.kind === 'bug' && i.status !== 'done' && i.status !== 'cancelled').length,
  }), [items]);

  function move(id: string, nextStatus: WorkItemStatus) {
    const item = items.find(i => i.id === id);
    if (!canEdit || !item || item.status === nextStatus || patchItem.isPending) return;
    patchItem.mutate({ id, changes: { status: nextStatus } });
  }
  function startDrag(event: DragEvent<HTMLDivElement>, id: string) {
    if (!canEdit) { event.preventDefault(); return; }
    setDragId(id);
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
  }
  function drop(event: DragEvent<HTMLElement>, nextStatus: WorkItemStatus) {
    event.preventDefault();
    const id = dragId || event.dataTransfer.getData('text/plain');
    if (id && items.some(i => i.id === id)) move(id, nextStatus);
    setDragId(null);
  }

  if (projectQuery.isLoading) return <ProjectLoading text="Opening project…" />;
  if (projectQuery.isError || !project) return (
    <div className="p-4"><ProjectError error={projectQuery.error || new Error('Project not found or access denied.')}
      retry={() => { void projectQuery.refetch(); }} /></div>
  );

  if (project.my_role === 'client_reviewer' && !canEdit && !canManage) {
    return <ClientProjectWorkspace project={project} />;
  }

  const tabs: { value: Tab; label: string; Icon: typeof ListChecks }[] = [
    { value: 'overview', label: 'Overview', Icon: FolderKanban },
    { value: 'board', label: 'Board', Icon: Columns3 },
    { value: 'list', label: 'List', Icon: LayoutList },
    { value: 'milestones', label: 'Milestones', Icon: CalendarDays },
    { value: 'files', label: 'Files', Icon: Files },
    { value: 'scope', label: 'Scope & Changes', Icon: FilePenLine },
    { value: 'support', label: 'Support Tickets', Icon: LifeBuoy },
    { value: 'activity', label: 'Activity', Icon: Activity },
    { value: 'conversation', label: 'Conversation', Icon: MessageSquare },
    ...(canEdit ? [{ value: 'time' as const, label: 'Time & Billing', Icon: Clock3 }] : []),
    { value: 'delivery', label: 'Delivery', Icon: ClipboardCheck },
    ...(canManage ? [{ value: 'team' as const, label: 'Team & Reviewers', Icon: Users }] : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--bg-base)' }}>
      <ProjectTitleBar back="/projects" eyebrow={`${project.key} · ${project.client_org_name}`} title={project.name}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <StatePill value={project.status} label={project.status === 'on_hold' ? 'On Hold' : undefined} />
            <ProjectProgressIndicator indicator={project.status_indicator} />
            {canManage && !['completed','archived'].includes(project.status) && <button type="button" className="btn-secondary" onClick={() => setShowSettings(true)}>
              <Settings2 size={13} /> Settings</button>}
            {canEdit && !['completed','archived'].includes(project.status) && <button type="button" className="btn-primary" onClick={() => setShowNewWork(true)}>
              <Plus size={13} /> Work Item</button>}
          </div>
        } />

      <nav role="tablist" aria-label="Project views" className="flex flex-shrink-0 gap-1 overflow-x-auto border-b px-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
        {tabs.map(({ value, label, Icon }) => (
          <button key={value} role="tab" aria-selected={tab === value}
            className="flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium"
            style={{ borderColor: tab === value ? 'var(--accent-info-fg)' : 'transparent',
              color: tab === value ? 'var(--text-0)' : 'var(--text-3)' }}
            onClick={() => setTab(value)}>
            <Icon size={13} />{label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {(itemsQuery.isError || milestonesQuery.isError) &&
          <div className="mb-3"><ProjectError error={itemsQuery.error || milestonesQuery.error}
            retry={() => { void itemsQuery.refetch(); void milestonesQuery.refetch(); }} /></div>}
        {patchItem.error && <div className="mb-3"><ProjectError error={patchItem.error} /></div>}
        {patchMilestone.error && <div className="mb-3"><ProjectError error={patchMilestone.error} /></div>}
        {removeMember.error && <div className="mb-3"><ProjectError error={removeMember.error} /></div>}

        {tab === 'files' && <ProjectFilesPanel project={project}/>}
        {tab === 'scope' && <ProjectScopePanel project={project}/>}
        {tab === 'support' && <ProjectSupportPanel project={project} workItems={items}/>}
        {tab === 'activity' && <ProjectActivityPanel projectId={projectId}/>}
        {tab === 'conversation' && <ProjectConversationPanel project={project}/>}
        {tab === 'time' && canEdit && <ProjectTimePanel project={project} workItems={items}/>}
        {tab === 'delivery' && <ProjectDeliveryPanel project={project}/>}
        {tab === 'overview' && (
          <div className="flex w-full min-w-0 flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <Stat label="Work Items" count={overview.total} Icon={ListChecks} />
              <Stat label="In Progress" count={overview.progress} Icon={Clock3} />
              <Stat label="Completed" count={overview.done} Icon={Check} />
              <Stat label="Open Bugs" count={overview.bugs} Icon={Shield} />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <section className="panel lg:col-span-2">
                <div className="panel-header"><span className="panel-title">Project Summary</span></div>
                <div className="space-y-4 p-4">
                  <p className="whitespace-pre-wrap text-[13px] leading-6" style={{ color: 'var(--text-2)' }}>
                    {project.description || 'No description added yet.'}
                  </p>
                  <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-4"
                    style={{ borderColor: 'var(--border-subtle)' }}>
                    <div><div style={{ color: 'var(--text-3)' }}>Client</div><div className="mt-1 font-medium" style={{ color: 'var(--text-1)' }}>{project.client_org_name}</div></div>
                    <div><div style={{ color: 'var(--text-3)' }}>Due Date</div><div className="mt-1 font-medium" style={{ color: 'var(--text-1)' }}>{formatProjectDate(project.due_date)}</div></div>
                    <div><div style={{ color: 'var(--text-3)' }}>Visibility</div><div className="mt-1"><StatePill value={project.visibility} label={project.visibility === 'client' ? 'Client Visible' : 'Internal'} /></div></div>
                    <div><div style={{ color: 'var(--text-3)' }}>Completed Work</div><div className="mt-1 font-medium" style={{ color: 'var(--text-1)' }}>{overview.total ? Math.round(overview.done / overview.total * 100) : 0}%</div></div>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">Milestone Progress</span>
                  <button className="text-xs" style={{ color: 'var(--accent-info-fg)' }} onClick={() => setTab('milestones')}>View all</button>
                </div>
                <div className="space-y-3 p-3">
                  {milestones.length === 0 ? <p className="py-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>No milestones yet</p> :
                    milestones.slice(0, 5).map(milestone => {
                      const related = items.filter(i => i.milestone_id === milestone.id);
                      const done = related.filter(i => i.status === 'done').length;
                      return <div key={milestone.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="truncate" style={{ color: 'var(--text-1)' }}>{milestone.name}</span>
                          <span className="font-mono" style={{ color: 'var(--text-3)' }}>{done}/{related.length}</span>
                        </div>
                        <div className="h-1.5" style={{ background: 'var(--bg-elevated)' }}>
                          <div className="h-full" style={{ width: `${related.length ? done / related.length * 100 : 0}%`, background: 'var(--accent-info-fg)' }} />
                        </div>
                      </div>;
                    })}
                </div>
              </section>
            </div>
            <section className="panel">
              <div className="panel-header"><span className="panel-title">Recent Work Items</span>
                <button className="text-xs" style={{ color: 'var(--accent-info-fg)' }} onClick={() => setTab('list')}>Open list</button>
              </div>
              {items.length === 0 ? <p className="p-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>No work items yet</p> :
                <div className="overflow-x-auto"><table className="data-table"><thead><tr>
                  <th>Work Item</th><th>Type</th><th>Status</th><th>Priority</th>
                </tr></thead><tbody>
                  {items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map(i =>
                    <tr key={i.id}><td><WorkLink item={i} projectId={projectId} /></td>
                      <td><StatePill value={i.kind} /></td><td><StatePill value={i.status} label={WORK_STATES.find(s => s.value === i.status)?.label} /></td>
                      <td><StatePill value={i.priority} /></td></tr>)}
                </tbody></table></div>}
            </section>
          </div>
        )}

        {(tab === 'board' || tab === 'list') && (
          <div className="flex h-full min-h-[300px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[160px] flex-1 sm:flex-none">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-3)' }} />
                <input className="input w-full pl-8 sm:w-64" aria-label="Search work items" placeholder="Search work items"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="select w-auto min-w-[110px]" aria-label="Filter by type"
                value={kind} onChange={e => setKind(e.target.value as KindFilter)}>
                <option value="all">All Types</option>{WORK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <select className="select w-auto min-w-[110px]" aria-label="Filter by priority"
                value={priority} onChange={e => setPriority(e.target.value as PriorityFilter)}>
                <option value="all">All Priorities</option>{WORK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-3)' }}>{filtered.length} items</span>
            </div>
            {itemsQuery.isLoading ? <ProjectLoading text="Loading work items…" /> :
              items.length === 0 ? <ProjectEmpty title="No work items"
                description="Create your first task, feature or bug to start tracking delivery."
                action={canEdit && <button className="btn-primary mt-2" onClick={() => setShowNewWork(true)}><Plus size={13} /> Create Work Item</button>} /> :
                tab === 'board' ? (
                  <div className="ticket-detail-scroll flex min-h-[350px] flex-1 gap-2 overflow-x-auto pb-3" role="region" aria-label="Kanban board">
                    {WORK_STATES.map(column => {
                      const columnItems = filtered.filter(i => i.status === column.value);
                      return (
                        <section key={column.value} className="flex w-[260px] min-w-[260px] flex-col border"
                          style={{ borderColor: 'var(--border-md)', background: 'var(--bg-surface)' }}
                          onDragOver={e => { if (canEdit) e.preventDefault(); }} onDrop={e => drop(e, column.value)}>
                          <div className="flex items-center justify-between gap-2 border-b px-3 py-3"
                            style={{ borderColor: 'var(--border-md)' }}>
                            <StatePill value={column.value} label={column.label} />
                            <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>{columnItems.length}</span>
                          </div>
                          <div className="ticket-detail-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                            {columnItems.length === 0 && <div className="p-3 text-center text-[11px]"
                              style={{ color: 'var(--text-3)' }}>No work items</div>}
                            {columnItems.map(item => (
                              <WorkCard key={item.id} item={item} projectId={projectId}
                                canEdit={canEdit} move={move} busy={patchItem.isPending}
                                startDrag={startDrag} finishDrag={() => setDragId(null)} />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="panel overflow-x-auto">
                    <table className="data-table"><thead><tr>
                      <th>Work Item</th><th>Type</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due Date</th>
                    </tr></thead><tbody>
                      {filtered.map(item => <WorkRow key={item.id} item={item} projectId={projectId}
                        canEdit={canEdit} move={move} busy={patchItem.isPending} />)}
                    </tbody></table>
                    {!filtered.length && <div className="p-5 text-center text-xs" style={{ color: 'var(--text-3)' }}>No work items match the filters.</div>}
                  </div>
                )}
          </div>
        )}

        {tab === 'milestones' && (
          <div className="w-full min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Milestones</h2>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Track major delivery targets and their work items.</p>
              </div>
              {canManage && <button className="btn-primary" onClick={() => setShowNewMilestone(true)}><Plus size={13} /> New Milestone</button>}
            </div>
            {milestonesQuery.isLoading ? <ProjectLoading /> : milestones.length === 0 ?
              <ProjectEmpty title="No milestones" description="Divide delivery into clear milestones."
                action={canManage && <button className="btn-primary mt-2" onClick={() => setShowNewMilestone(true)}>Create Milestone</button>} /> :
              milestones.map((milestone: ProjectMilestone) => {
                const related = items.filter(item => item.milestone_id === milestone.id);
                const done = related.filter(item => item.status === 'done').length;
                const percent = related.length ? Math.round(done / related.length * 100) : 0;
                return (
                  <section key={milestone.id} className="panel">
                    <div className="flex flex-wrap items-center gap-3 p-4">
                      <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>{milestone.name}</span>
                        {milestone.description && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{milestone.description}</p>}
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                          <CalendarDays size={12} /> {formatProjectDate(milestone.due_date)} · {related.length} work items
                        </span>
                      </div>
                      {canManage && (
                        <select className="select w-auto" aria-label={`Visibility for ${milestone.name}`}
                          disabled={patchMilestone.isPending} value={milestone.visibility}
                          onChange={e => patchMilestone.mutate({
                            id: milestone.id, changes: { visibility: e.target.value as ProjectMilestone['visibility'] },
                          })}>
                          <option value="internal">Internal</option>
                          <option value="client">Client Visible</option>
                        </select>
                      )}
                      {canManage ? (
                        <select className="select w-auto" aria-label={`Status for ${milestone.name}`}
                          disabled={patchMilestone.isPending} value={milestone.status}
                          onChange={e => patchMilestone.mutate({
                            id: milestone.id, changes: { status: e.target.value as ProjectMilestone['status'] },
                          })}>
                          <option value="planned">Planned</option><option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      ) : <StatePill value={milestone.status} />}
                      <span className="min-w-[45px] text-right font-mono text-xs" style={{ color: 'var(--text-2)' }}>{percent}%</span>
                    </div>
                    <div className="mx-4 mb-3 h-1.5" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="h-full" style={{ width: `${percent}%`, background: 'var(--accent-info-fg)' }} />
                    </div>
                    {related.length > 0 && (
                      <div className="border-t px-4 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
                        {related.slice(0, 4).map(item => (
                          <Link key={item.id} href={`/projects/${projectId}/work-items/${item.id}`}
                            className="flex items-center gap-2 py-1.5 text-xs">
                            <span className="font-mono" style={{ color: 'var(--text-3)' }}>{item.ref}</span>
                            <span className="flex-1 truncate" style={{ color: 'var(--text-1)' }}>{item.title}</span>
                            <StatePill value={item.status} label={WORK_STATES.find(s => s.value === item.status)?.label} />
                            <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />
                          </Link>
                        ))}
                        {related.length > 4 && <p className="py-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{related.length - 4} more work items</p>}
                      </div>
                    )}
                  </section>
                );
              })}
          </div>
        )}

        {tab === 'team' && canManage && (
          <div className="w-full min-w-0 space-y-3">
            <section className="panel">
              <div className="panel-header">
                <div className="flex items-center gap-2">
                  <span className="panel-title">Staff Team</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {members.filter(m => m.role !== 'client_reviewer').length}
                  </span>
                </div>
                <button className="btn-primary" type="button"
                  onClick={() => setShowAddMember(true)}>
                  <Plus size={13} /> Add Staff
                </button>
              </div>
              {membersQuery.isLoading ? <ProjectLoading text="Loading team…" /> :
                membersQuery.isError ? <div className="p-3">
                  <ProjectError error={membersQuery.error} retry={() => { void membersQuery.refetch(); }} />
                </div> :
                members.filter(m => m.role !== 'client_reviewer').length === 0 ?
                  <ProjectEmpty title="No Staff Members"
                    description="Assign staff members to manage and deliver project work." /> :
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Email</th><th>Role</th>
                        <th aria-label="Remove staff member" /></tr></thead>
                      <tbody>{members.filter(m => m.role !== 'client_reviewer').map(member => (
                        <tr key={member.id}>
                          <td>{member.user_name}</td>
                          <td>{member.user_email}</td>
                          <td><StatePill value={member.role}
                            label={member.role.replace(/_/g, ' ')} /></td>
                          <td className="text-right">
                            <button type="button" className="icon-btn inline-flex"
                              aria-label={`Remove ${member.user_name}`}
                              disabled={removeMember.isPending}
                              onClick={() => {
                                if (window.confirm(`Remove ${member.user_name} from this Project?`)) {
                                  removeMember.mutate(member.id);
                                }
                              }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
              }
            </section>
            <section className="panel">
              <div className="panel-header">
                <div className="flex items-center gap-2">
                  <span className="panel-title">Client Reviewers</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {members.filter(m => m.role === 'client_reviewer').length}
                  </span>
                </div>
                <button className="btn-primary" type="button"
                  onClick={() => setShowAddReviewer(true)}>
                  <Plus size={13} /> Add Reviewer
                </button>
              </div>
              {membersQuery.isLoading ? <ProjectLoading text="Loading reviewers…" /> :
                membersQuery.isError ? <div className="p-3">
                  <ProjectError error={membersQuery.error} retry={() => { void membersQuery.refetch(); }} />
                </div> :
                members.filter(m => m.role === 'client_reviewer').length === 0 ?
                  <ProjectEmpty title="No Client Reviewers"
                    description="Choose existing users from this Project's Client Organization." /> :
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Email</th><th>Access</th>
                        <th aria-label="Revoke client reviewer" /></tr></thead>
                      <tbody>{members.filter(m => m.role === 'client_reviewer').map(member => (
                        <tr key={member.id}>
                          <td>{member.user_name}</td>
                          <td>{member.user_email}</td>
                          <td><StatePill value="client" label="Client Reviewer" /></td>
                          <td className="text-right">
                            <button type="button" className="icon-btn inline-flex"
                              aria-label={`Revoke ${member.user_name}`}
                              disabled={removeMember.isPending}
                              onClick={() => {
                                if (window.confirm(`Revoke ${member.user_name}'s Project access? Existing comments remain.`)) {
                                  removeMember.mutate(member.id);
                                }
                              }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
              }
              <div className="border-t px-3 py-2 text-[11px]"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
                Reviewers can view only Client Visible Projects and Work Items.
                Revoking membership prevents further portal access and email replies.
              </div>
            </section>
          </div>
        )}
      </div>

      {showNewWork && <CreateWorkItemDialog projectId={projectId} milestones={milestones} members={members}
        canManage={canManage} onClose={() => setShowNewWork(false)} />}
      {showNewMilestone && <CreateMilestoneDialog projectId={projectId} onClose={() => setShowNewMilestone(false)} />}
      {showAddMember && <AddProjectMemberDialog projectId={projectId} existingMembers={members}
        onClose={() => setShowAddMember(false)} />}
      {showAddReviewer && <ProjectReviewerDialog projectId={projectId}
        clientOrgId={project.client_org} onClose={() => setShowAddReviewer(false)} />}
      {showSettings && <EditProjectDialog project={project} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
