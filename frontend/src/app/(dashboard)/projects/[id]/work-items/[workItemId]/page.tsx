'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, CalendarDays, ClipboardList, Eye, FolderKanban, Lock,
  Mail, MessageSquare, Pencil, Send, UserRound,
} from 'lucide-react';
import {
  useProject, useProjectMembers, useProjectMilestones, useWorkItem,
  useWorkItemComments, useUpdateWorkItem, useAddWorkItemComment,
} from '@/hooks/useProjects';
import { useWorkItemSupportTickets } from '@/hooks/useTicketProjects';
import { useAuthStore } from '@/store/useAuthStore';
import { ProjectEmailDialog } from '@/components/projects/ProjectEmailDialog';
import { ProjectFilesPanel } from '@/components/projects/ProjectFilesPanel';
import { WorkItemAdvancedPanel, WorkItemProgressBadge } from '@/components/projects/WorkItemAdvancedPanel';
import { ProjectTimePanel } from '@/components/projects/ProjectTimePanel';
import type {
  WorkItem, WorkItemKind, WorkItemPriority, WorkItemStatus, WorkVisibility,
} from '@/types/projects';
import {
  ProjectDialog, ProjectError, ProjectLoading, ProjectTitleBar, StatePill,
  WORK_STATES, WORK_KINDS, WORK_PRIORITIES, formatProjectDate,
} from '@/components/projects/ProjectUI';

function EditWorkItemDialog({ item, projectId, canManage, onClose }: {
  item: WorkItem; projectId: string; canManage: boolean; onClose: () => void;
}) {
  const update = useUpdateWorkItem(projectId);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [kind, setKind] = useState<WorkItemKind>(item.kind);
  const [visibility, setVisibility] = useState<WorkVisibility>(item.visibility);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await update.mutateAsync({
        id: item.id, changes: {
          title: title.trim(), description, kind,
          ...(canManage ? { visibility } : {}),
        },
      });
      onClose();
    } catch { /* Mutation error is shown in the dialog. */ }
  }

  return (
    <ProjectDialog title={`Edit ${item.ref}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {update.error && <ProjectError error={update.error} />}
        <div>
          <label className="label" htmlFor="edit-work-title">Title</label>
          <input id="edit-work-title" required maxLength={300} autoFocus className="input"
            value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="edit-work-description">Description</label>
          <textarea id="edit-work-description" className="input min-h-[160px] resize-y"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="edit-work-type">Type</label>
            <select id="edit-work-type" className="select" value={kind}
              onChange={e => setKind(e.target.value as WorkItemKind)}>
              {WORK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          {canManage && <div>
            <label className="label" htmlFor="edit-work-visibility">Visibility</label>
            <select id="edit-work-visibility" className="select" value={visibility}
              onChange={e => setVisibility(e.target.value as WorkVisibility)}>
              <option value="internal">Internal</option>
              <option value="client">Client Visible</option>
            </select>
          </div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" type="button" disabled={update.isPending} onClick={onClose}>Cancel</button>
          <button className="btn-primary" type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ProjectDialog>
  );
}

export default function WorkItemDetailPage() {
  const { id: projectId, workItemId } = useParams<{ id: string; workItemId: string }>();
  const itemQuery = useWorkItem(workItemId);
  const projectQuery = useProject(projectId);
  const item = itemQuery.data;
  const project = projectQuery.data;
  const canEdit = Boolean(project?.can_edit);
  const canManage = Boolean(project?.can_manage);
  const milestonesQuery = useProjectMilestones(projectId);
  const membersQuery = useProjectMembers(projectId, canManage);
  const commentsQuery = useWorkItemComments(workItemId);
  const isStaff = useAuthStore(state => ['msp_owner', 'msp_manager', 'msp_agent'].includes(state.user?.role || ''));
  const isClientReviewer = Boolean(
    project?.my_role === 'client_reviewer' &&
    project?.visibility === 'client' &&
    item?.visibility === 'client'
  );
  const canComment = canEdit || isClientReviewer;
  const linkedTicketQuery = useWorkItemSupportTickets(workItemId, isStaff);
  const update = useUpdateWorkItem(projectId);
  const addComment = useAddWorkItemComment(workItemId);
  const [editing, setEditing] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [visibility, setVisibility] = useState<WorkVisibility>('internal');

  function save(changes: Parameters<typeof update.mutate>[0]['changes']) {
    if (!item || !canEdit || update.isPending) return;
    update.mutate({ id: item.id, changes });
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = commentText.trim();
    if (!body || !canComment) return;
    try {
      await addComment.mutateAsync({ body, visibility: isClientReviewer ? 'client' : visibility });
      setCommentText('');
    } catch { /* Mutation error is visible below. */ }
  }

  if (itemQuery.isLoading || projectQuery.isLoading) return <ProjectLoading text="Loading work item…" />;
  if (itemQuery.isError || projectQuery.isError || !item || !project || item.project !== projectId) {
    return <div className="p-4"><ProjectError error={itemQuery.error || projectQuery.error || new Error('Work item not found.')}
      retry={() => { void itemQuery.refetch(); void projectQuery.refetch(); }} /></div>;
  }

  const milestones = milestonesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const comments = commentsQuery.data ?? [];
  const sectionStyle = { background: 'var(--bg-card)', borderColor: 'var(--border-md)' };

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--bg-base)' }}>
      <ProjectTitleBar back={`/projects/${projectId}`} eyebrow={`${project.key} / ${item.ref}`}
        title={item.title}
        right={<div className="flex flex-wrap items-center gap-2">
          {canManage && project.project_email_enabled && item.visibility === 'client' && project.visibility === 'client' && (
            <button className="btn-primary" onClick={() => setNotifyOpen(true)}>
              <Mail size={13} /> Notify Client
            </button>
          )}
          {canEdit && (
            <button className="btn-secondary" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit Work Item
            </button>
          )}
        </div>} />
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/projects" className="inline-flex items-center gap-1"
              style={{ color: 'var(--text-3)' }}><FolderKanban size={13} /> Projects</Link>
            <span style={{ color: 'var(--text-3)' }}>/</span>
            <Link href={`/projects/${projectId}`} style={{ color: 'var(--text-3)' }}>{project.name}</Link>
            <span style={{ color: 'var(--text-3)' }}>/</span>
            <span className="font-mono" style={{ color: 'var(--text-1)' }}>{item.ref}</span>
          </div>

          <WorkItemProgressBadge item={item}/>
          {update.error && <ProjectError error={update.error} />}
          {addComment.error && <ProjectError error={addComment.error} />}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="flex min-w-0 flex-col gap-3">
              <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">Work Item</span>
                  <div className="flex items-center gap-2">
                    <StatePill value={item.kind} />
                    <StatePill value={item.visibility} label={item.visibility === 'client' ? 'Client Visible' : 'Internal'} />
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="mb-3 text-lg font-semibold leading-snug" style={{ color: 'var(--text-0)' }}>{item.title}</h2>
                  {item.description ? (
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-6" style={{ color: 'var(--text-2)' }}>{item.description}</p>
                  ) : (
                    <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>No description has been added.</p>
                  )}
                </div>
              </section>

              <WorkItemAdvancedPanel project={project} item={item}/>
              {canEdit && <ProjectTimePanel project={project} workItems={[item]} workItemId={item.id}/>}
              <ProjectFilesPanel project={project} category="work_item" workItemId={item.id}/>

              <section className="panel">
                <div className="panel-header">
                  <div className="flex items-center gap-2"><MessageSquare size={14} style={{ color: 'var(--text-3)' }} />
                    <span className="panel-title">Discussion</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{comments.length}</span>
                  </div>
                </div>
                {commentsQuery.isLoading ? <ProjectLoading text="Loading discussion…" /> :
                  commentsQuery.isError ? <div className="p-3"><ProjectError error={commentsQuery.error}
                    retry={() => { void commentsQuery.refetch(); }} /></div> :
                    comments.length === 0 ? (
                      <div className="px-4 py-7 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                        No comments yet. Keep technical decisions and feedback organized here.
                      </div>
                    ) : (
                      <div className="space-y-2 p-3">
                        {comments.map(comment => (
                          <article key={comment.id} className="border p-3" style={sectionStyle}>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{comment.author_name || 'Former Member'}</span>
                              <StatePill value={comment.visibility} label={comment.visibility === 'client' ? 'Client Visible' : 'Internal'} />
                              {comment.source === 'email' && (
                                <span className="flex items-center gap-1 text-[11px]"
                                  style={{ color: 'var(--text-3)' }}>
                                  <Mail size={12} /> via Email
                                </span>
                              )}
                              <span className="ml-auto text-[11px]" style={{ color: 'var(--text-3)' }}>
                                {new Date(comment.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-[13px] leading-6" style={{ color: 'var(--text-2)' }}>{comment.body}</p>
                          </article>
                        ))}
                      </div>
                    )}

                {canComment && <form onSubmit={submitComment} className="border-t p-3"
                  style={{ borderColor: 'var(--border-md)' }}>
                  <label className="label" htmlFor="work-comment">{isClientReviewer ? 'Your Feedback' : 'Add Comment'}</label>
                  <textarea id="work-comment" className="input min-h-[100px] resize-y"
                    value={commentText} maxLength={10000} onChange={e => setCommentText(e.target.value)}
                    placeholder="Write a project update or internal note…" required />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {isClientReviewer ? (
                      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        Client visible feedback is not formal approval
                      </span>
                    ) : canManage ? (
                      <select className="select w-auto" aria-label="Comment visibility"
                        value={visibility} onChange={e => setVisibility(e.target.value as WorkVisibility)}>
                        <option value="internal">Internal Note</option>
                        {item.visibility === 'client' && project.visibility === 'client' &&
                          <option value="client">Client Visible</option>}
                      </select>
                    ) : <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
                      <Lock size={13} /> Internal Note
                    </span>}
                    <button className="btn-primary" type="submit"
                      disabled={addComment.isPending || !commentText.trim()}>
                      <Send size={13} /> {addComment.isPending ? 'Posting…' : isClientReviewer ? 'Post Feedback' : 'Post Comment'}
                    </button>
                  </div>
                </form>}
              </section>
            </div>

            <aside className="flex flex-col gap-3">
              <section className="panel">
                <div className="panel-header"><span className="panel-title">Properties</span></div>
                <div className="space-y-3 p-3">
                  <div>
                    <label className="label" htmlFor="item-status">Status</label>
                    {canEdit ? <select id="item-status" className="select" value={item.status}
                      disabled={update.isPending} onChange={e => save({ status: e.target.value as WorkItemStatus })}>
                      {WORK_STATES.map(s => <option key={s.value} value={s.value}
                        disabled={(item.is_blocked && ['in_progress','in_review','done'].includes(s.value))
                || (s.value === 'done' && item.checklist_total > item.checklist_completed)}>
                        {s.label}
                      </option>)}
                    </select> : <StatePill value={item.status} label={WORK_STATES.find(s => s.value === item.status)?.label} />}
                  </div>
                  <div>
                    <label className="label" htmlFor="item-priority">Priority</label>
                    {canEdit ? <select id="item-priority" className="select" value={item.priority}
                      disabled={update.isPending} onChange={e => save({ priority: e.target.value as WorkItemPriority })}>
                      {WORK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select> : <StatePill value={item.priority} />}
                  </div>
                  <div>
                    <label className="label" htmlFor="item-milestone">Milestone</label>
                    {canEdit ? <select id="item-milestone" className="select" value={item.milestone_id || ''}
                      disabled={update.isPending || milestonesQuery.isLoading}
                      onChange={e => save({ milestone_id: e.target.value || null })}>
                      <option value="">No milestone</option>
                      {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select> :
                      <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                        {milestones.find(m => m.id === item.milestone_id)?.name || 'No milestone'}
                      </p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="item-assignee">Assignee</label>
                    {canManage ? <select id="item-assignee" className="select" value={item.assignee_id || ''}
                      disabled={update.isPending || membersQuery.isLoading}
                      onChange={e => save({ assignee_id: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {members.filter(m => m.role === 'manager' || m.role === 'contributor').map(m => (
                        <option key={m.id} value={m.user}>{m.user_name}</option>
                      ))}
                    </select> :
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                        <UserRound size={14} />{item.assignee_name || 'Unassigned'}
                      </div>}
                  </div>
                  <div>
                    <label className="label" htmlFor="item-due">Due Date</label>
                    {canEdit ? <input id="item-due" className="input" type="date"
                      value={item.due_date || ''} disabled={update.isPending}
                      onChange={e => save({ due_date: e.target.value || null })} /> :
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
                        <CalendarDays size={13} /> {formatProjectDate(item.due_date)}
                      </span>}
                  </div>
                  <div className="flex items-center justify-between border-t pt-3 text-xs"
                    style={{ borderColor: 'var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-3)' }}>Visibility</span>
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-2)' }}>
                      {item.visibility === 'client' ? <Eye size={13} /> : <Lock size={13} />}
                      {item.visibility === 'client' ? 'Client Visible' : 'Internal'}
                    </span>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-header"><span className="panel-title">Project</span></div>
                <div className="p-3">
                  <Link href={`/projects/${projectId}`} className="flex items-center gap-2 text-xs"
                    style={{ color: 'var(--accent-info-fg)' }}>
                    <ClipboardList size={15} /> {project.name}
                  </Link>

                </div>
              </section>
              {isStaff && <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">Linked Support Tickets</span>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {linkedTicketQuery.data?.length ?? 0}
                  </span>
                </div>
                {linkedTicketQuery.isLoading ? (
                  <div className="p-3 text-xs" style={{ color: 'var(--text-3)' }}>Loading ticket links…</div>
                ) : linkedTicketQuery.isError ? (
                  <div className="p-3"><ProjectError error={linkedTicketQuery.error}
                    retry={() => { void linkedTicketQuery.refetch(); }} /></div>
                ) : linkedTicketQuery.data?.length ? (
                  <div className="space-y-1 p-2">
                    {linkedTicketQuery.data.map(linked => (
                      <Link key={linked.ref} href={`/requests/${encodeURIComponent(linked.ref)}`}
                        className="block border p-2 text-xs hover:bg-[var(--bg-hover)]"
                        style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="font-mono" style={{ color: 'var(--accent-info-fg)' }}>{linked.ref}</span>
                        <span className="mt-1 block break-words" style={{ color: 'var(--text-1)' }}>{linked.subject}</span>
                        <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {linked.status.replace(/_/g, ' ')}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="p-3 text-xs" style={{ color: 'var(--text-3)' }}>
                    No linked Support Tickets.
                  </p>
                )}
              </section>}
              <Link href={`/projects/${projectId}`} className="btn-secondary justify-center">
                <ArrowLeft size={13} /> Back to Project
              </Link>
            </aside>
          </div>
        </div>
      </div>
      {notifyOpen && <ProjectEmailDialog workItemId={workItemId}
        onClose={() => setNotifyOpen(false)} />}
      {editing && <EditWorkItemDialog key={item.updated_at} item={item} projectId={projectId}
        canManage={canManage} onClose={() => setEditing(false)} />}
    </div>
  );
}
