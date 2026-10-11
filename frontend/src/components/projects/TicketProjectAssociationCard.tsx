'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, FolderKanban, Link2, Loader2, Plus, Unlink2,
} from 'lucide-react';
import { useProjects, useProjectMembers, useProjectWorkItems } from '@/hooks/useProjects';
import {
  useTicketProjectAssociation, useLinkTicketProject, useUnlinkTicketProject,
  useLinkTicketWorkItem, useUnlinkTicketWorkItem, useCreateLinkedTicketWorkItem,
} from '@/hooks/useTicketProjects';
import type { WorkItemKind, WorkItemPriority } from '@/types/projects';
import { ProjectDialog, ProjectError, WORK_KINDS, WORK_PRIORITIES, StatePill } from './ProjectUI';

interface Props {
  ticketRef: string;
  clientOrgId: string | null;
  clientOrgName: string | null;
}

const mono = { fontFamily: '"IBM Plex Mono", monospace' };

function CreateLinkedWorkItemDialog({
  ticketRef, projectId, canManage, members, allowClientVisibility, onClose,
}: {
  ticketRef: string;
  projectId: string;
  canManage: boolean;
  members: { id: string; user: string; user_name: string; role: string }[];
  allowClientVisibility: boolean;
  onClose: () => void;
}) {
  const create = useCreateLinkedTicketWorkItem(ticketRef, projectId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<WorkItemKind>('bug');
  const [priority, setPriority] = useState<WorkItemPriority>('normal');
  const [assigneeId, setAssigneeId] = useState('');
  const [clientVisible, setClientVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || create.isPending) return;
    try {
      await create.mutateAsync({
        title: title.trim(), description, kind, priority,
        ...(canManage && assigneeId ? { assignee_id: assigneeId } : {}),
        visibility: clientVisible && canManage && allowClientVisibility ? 'client' : 'internal',
      });
      onClose();
    } catch { /* The mutation error is rendered below. */ }
  }

  return (
    <ProjectDialog title="Create Work Item" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {create.error && <ProjectError error={create.error} />}
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          This creates a separate Work Item and links it to the current Support Ticket.
          The Ticket status and SLA stay unchanged.
        </p>
        <div>
          <label className="label" htmlFor="ticket-new-work-title">Title</label>
          <input id="ticket-new-work-title" className="input" value={title} autoFocus required
            maxLength={300} placeholder="Fix checkout validation"
            onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ticket-new-work-description">Description</label>
          <textarea id="ticket-new-work-description" className="input min-h-[110px] resize-y"
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Describe the work required…" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ticket-new-work-kind">Type</label>
            <select id="ticket-new-work-kind" className="select" value={kind}
              onChange={e => setKind(e.target.value as WorkItemKind)}>
              {WORK_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ticket-new-work-priority">Priority</label>
            <select id="ticket-new-work-priority" className="select" value={priority}
              onChange={e => setPriority(e.target.value as WorkItemPriority)}>
              {WORK_PRIORITIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>
        {canManage && (
          <div>
            <label className="label" htmlFor="ticket-new-work-assignee">Assigned Developer</label>
            <select id="ticket-new-work-assignee" className="select" value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.filter(member => member.role === 'manager' || member.role === 'contributor').map(member => (
                <option key={member.id} value={member.user}>{member.user_name}</option>
              ))}
            </select>
          </div>
        )}
        {canManage && allowClientVisibility && (
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} />
            Visible to authorized client members
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={create.isPending}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || create.isPending}>
            {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create and Link
          </button>
        </div>
      </form>
    </ProjectDialog>
  );
}

export function TicketProjectAssociationCard({ ticketRef, clientOrgId, clientOrgName }: Props) {
  const associationQuery = useTicketProjectAssociation(ticketRef);
  const { data: projects = [], isError: projectListFailed } = useProjects();
  const association = associationQuery.data;
  const projectId = association?.project?.id || '';
  const selectedProject = projects.find(project => project.id === projectId);
  const canManage = Boolean(selectedProject?.can_manage);
  const canEdit = Boolean(association?.can_edit);

  const projectWorkItems = useProjectWorkItems(projectId);
  const memberQuery = useProjectMembers(projectId, canManage);
  const linkProject = useLinkTicketProject(ticketRef);
  const unlinkProject = useUnlinkTicketProject(ticketRef);
  const linkWorkItem = useLinkTicketWorkItem(ticketRef);
  const unlinkWorkItem = useUnlinkTicketWorkItem(ticketRef);

  const [projectChoice, setProjectChoice] = useState('');
  const [workChoice, setWorkChoice] = useState('');
  const [changeProject, setChangeProject] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setProjectChoice(projectId);
    setWorkChoice('');
    setChangeProject(false);
  }, [projectId]);

  const accessibleProjects = projects.filter(project =>
    project.client_org === clientOrgId && project.can_edit);
  const workItems = projectWorkItems.data || [];
  const linkedWorkItemIds = new Set((association?.work_items || []).map(item => item.id));
  const eligibleWorkItems = workItems.filter(item => !linkedWorkItemIds.has(item.id));
  const busy = linkProject.isPending || unlinkProject.isPending || linkWorkItem.isPending || unlinkWorkItem.isPending;
  const operationError = linkProject.error || unlinkProject.error || linkWorkItem.error || unlinkWorkItem.error;

  async function saveProject() {
    if (!projectChoice || busy) return;
    try {
      await linkProject.mutateAsync(projectChoice);
      setChangeProject(false);
    } catch { /* Error is displayed inside the card. */ }
  }

  async function clearProject() {
    if (!association?.project || !canEdit || busy) return;
    if (!window.confirm('Remove this Project Association? The Support Ticket will remain unchanged.')) return;
    try {
      await unlinkProject.mutateAsync();
    } catch { /* Error is displayed inside the card. */ }
  }

  async function attachWorkItem() {
    if (!workChoice || busy) return;
    try {
      await linkWorkItem.mutateAsync(workChoice);
      setWorkChoice('');
    } catch { /* Error is displayed inside the card. */ }
  }

  async function detachWorkItem(workItemId: string, reference: string) {
    if (!canEdit || busy) return;
    if (!window.confirm(`Unlink ${reference} from this Ticket? The Work Item will not be deleted.`)) return;
    try {
      await unlinkWorkItem.mutateAsync(workItemId);
    } catch { /* Error is displayed inside the card. */ }
  }

  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
      <div className="flex items-center justify-between px-3.5 py-2"
        style={{ borderBottom: '1px solid var(--border-md)' }}>
        <div className="flex items-center gap-2">
          <FolderKanban size={14} style={{ color: 'var(--accent-info-fg)' }} />
          <span className="text-[11px] font-bold uppercase tracking-wider"
            style={{ ...mono, color: 'var(--text-1)' }}>Project Association</span>
        </div>
        {association?.linked && <StatePill value="active" label="Linked" />}
      </div>

      <div className="space-y-2.5 p-3">
        {associationQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
            <Loader2 size={13} className="animate-spin" /> Loading association…
          </div>
        ) : associationQuery.isError ? (
          <ProjectError error={associationQuery.error} retry={() => { void associationQuery.refetch(); }} />
        ) : (
          <>
            {operationError && <ProjectError error={operationError} />}
            {!clientOrgId || clientOrgName === 'Walk-In' ? (
              <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
                Assign this Ticket to the correct Client Organization before linking a Project.
              </p>
            ) : association?.project ? (
              <>
                <div className="border p-2.5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>Project</div>
                  <Link href={`/projects/${projectId}`}
                    className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold"
                    style={{ color: 'var(--accent-info-fg)' }}>
                    <span className="min-w-0 break-words">{association.project.name}</span>
                    <ArrowUpRight size={14} className="flex-shrink-0" />
                  </Link>
                  <span className="mt-1 block text-[11px] font-mono"
                    style={{ color: 'var(--text-3)' }}>{association.project.key}</span>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>
                      Linked Work Items
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {association.work_items.length}
                    </span>
                  </div>
                  {association.work_items.length === 0 ? (
                    <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
                      No Work Item linked. The Ticket remains a separate Support Request.
                    </p>
                  ) : association.work_items.map(item => (
                    <div key={item.id} className="mb-1.5 flex items-start gap-2 border px-2 py-2"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
                      <Link href={`/projects/${projectId}/work-items/${item.id}`}
                        className="min-w-0 flex-1 text-xs" style={{ color: 'var(--text-1)' }}>
                        <span className="block font-mono text-[11px]" style={{ color: 'var(--accent-info-fg)' }}>
                          {item.ref}
                        </span>
                        <span className="mt-0.5 block break-words">{item.title}</span>
                      </Link>
                      {canEdit && (
                        <button type="button" className="icon-btn flex-shrink-0" disabled={busy}
                          title={`Unlink ${item.ref}`} aria-label={`Unlink ${item.ref}`}
                          onClick={() => { void detachWorkItem(item.id, item.ref); }}>
                          <Unlink2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {canEdit && (
                  <>
                    <div className="border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                      <label htmlFor="linked-existing-work-item" className="label">Link Existing Work Item</label>
                      <div className="flex flex-col gap-1.5">
                        <select id="linked-existing-work-item" className="select w-full"
                          value={workChoice} onChange={e => setWorkChoice(e.target.value)}
                          disabled={projectWorkItems.isLoading || busy || eligibleWorkItems.length === 0}>
                          <option value="">Select Work Item</option>
                          {eligibleWorkItems.map(item => (
                            <option key={item.id} value={item.id}>{item.ref} · {item.title}</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className="btn-secondary" disabled={!workChoice || busy}
                            onClick={() => { void attachWorkItem(); }}><Link2 size={12} /> Link Existing</button>
                          <button type="button" className="btn-primary" disabled={busy}
                            onClick={() => setCreateOpen(true)}><Plus size={12} /> Create Work Item</button>
                        </div>
                      </div>
                      {projectWorkItems.isError && <div className="mt-2"><ProjectError error={projectWorkItems.error} /></div>}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                      <button className="text-[11px] hover:underline" style={{ color: 'var(--text-3)' }}
                        disabled={association.work_items.length > 0 || busy}
                        title={association.work_items.length > 0 ? 'Unlink Work Items before changing the Project' : 'Change Project'}
                        onClick={() => setChangeProject(value => !value)}>Change Project</button>
                      <span style={{ color: 'var(--border-strong)' }}>·</span>
                      <button className="text-[11px] hover:underline" style={{ color: 'var(--accent-danger-fg)' }}
                        disabled={association.work_items.length > 0 || busy}
                        title={association.work_items.length > 0 ? 'Unlink Work Items first' : 'Remove Project Association'}
                        onClick={() => { void clearProject(); }}>Unlink Project</button>
                    </div>
                    {changeProject && association.work_items.length === 0 && (
                      <div className="space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                        <label htmlFor="change-ticket-project" className="label">Choose Project</label>
                        <select id="change-ticket-project" className="select w-full"
                          value={projectChoice} onChange={e => setProjectChoice(e.target.value)}>
                          {accessibleProjects.map(project => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                          ))}
                        </select>
                        <button type="button" className="btn-primary" disabled={!projectChoice || busy}
                          onClick={() => { void saveProject(); }}>Save Project</button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
                  This Ticket is not linked to any Project.
                </p>
                <label htmlFor="ticket-project-choice" className="label">Project</label>
                <select id="ticket-project-choice" className="select w-full" value={projectChoice}
                  onChange={e => setProjectChoice(e.target.value)}
                  disabled={busy || accessibleProjects.length === 0}>
                  <option value="">Select Project</option>
                  {accessibleProjects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
                {projectListFailed && <p className="text-[11px]" style={{ color: 'var(--accent-danger-fg)' }}>
                  Could not load the available Projects.
                </p>}
                {!projectListFailed && accessibleProjects.length === 0 &&
                  <p className="text-[11px] leading-5" style={{ color: 'var(--text-3)' }}>
                    No editable Project found for this Client Organization.
                  </p>}
                <button type="button" className="btn-primary" disabled={!projectChoice || busy}
                  onClick={() => { void saveProject(); }}>
                  {linkProject.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                  Link to Project
                </button>
              </>
            )}
          </>
        )}
      </div>
      {createOpen && association?.project && (
        <CreateLinkedWorkItemDialog
          ticketRef={ticketRef} projectId={projectId}
          canManage={canManage} members={memberQuery.data || []}
          allowClientVisibility={selectedProject?.visibility === 'client'}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </section>
  );
}
