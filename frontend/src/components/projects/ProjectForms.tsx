'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useClientOrgs } from '@/hooks/useClientOrgs';
import { useAgents } from '@/hooks/useAgents';
import { useAuthStore } from '@/store/useAuthStore';
import { useProjectTemplates, useCreateProjectFromTemplate, useProjectTemplatePreview } from '@/hooks/useProjectInsights';
import {
  useCreateProject, useCreateMilestone, useCreateWorkItem,
  useAddProjectMember, useUpdateProject,
} from '@/hooks/useProjects';
import type {
  Project, ProjectMember, ProjectMilestone, ProjectRole, ProjectStatus,
  ProjectVisibility, WorkItemKind, WorkItemPriority, WorkVisibility,
} from '@/types/projects';
import { ProjectDialog, ProjectError, PROJECT_STATES, WORK_KINDS, WORK_PRIORITIES } from './ProjectUI';

function Footer({ busy, submit, onClose }: { busy: boolean; submit: string; onClose: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submit}</button>
    </div>
  );
}

export function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: orgs = [], isLoading: orgsLoading, error: orgsError } = useClientOrgs();
  const create = useCreateProject();
  const createFromTemplate = useCreateProjectFromTemplate();
  const role = useAuthStore(state => state.user?.role);
  const canUseTemplates = role === 'msp_owner' || role === 'msp_manager';
  const templates = useProjectTemplates(canUseTemplates);
  const [templateId, setTemplateId] = useState('');
  const preview = useProjectTemplatePreview(templateId, canUseTemplates && Boolean(templateId));
  const [startDate, setStartDate] = useState('');
  const [orgId, setOrgId] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [visibility, setVisibility] = useState<ProjectVisibility>('internal');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orgId || !name.trim() || !/^[A-Z0-9]{2,12}$/.test(key)) return;
    if (templateId && !window.confirm(
      'Create Project from this Template? Confirm all template descriptions are suitable for the selected Client Organization.',
    )) return;
    try {
      const payload = {
        client_org_id: orgId, key, name: name.trim(), description,
        visibility, ...(startDate ? { start_date: startDate } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
      };
      const result = templateId && canUseTemplates
        ? await createFromTemplate.mutateAsync({ ...payload, template_id: templateId })
        : await create.mutateAsync(payload);
      onClose();
      router.push(`/projects/${result.id}`);
    } catch { /* Error is displayed below. */ }
  }

  return (
    <ProjectDialog title="Create Project" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {orgsError && <ProjectError error={orgsError} />}
        {create.error && <ProjectError error={create.error} />}
        {createFromTemplate.error && <ProjectError error={createFromTemplate.error}/>}
        {canUseTemplates && templates.error && <ProjectError error={templates.error}/>}
        {canUseTemplates && Boolean(templates.data?.length) && <div>
          <label className="label" htmlFor="project-template">Create From Template</label>
          <select id="project-template" className="select" value={templateId}
            onChange={e => setTemplateId(e.target.value)}>
            <option value="">Start Empty Project</option>
            {templates.data?.map(row => <option key={row.id} value={row.id}>
              {row.name} ({row.work_item_count} Work Items)
            </option>)}
          </select>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Timeline dates shift from the new Project Start Date. No historical billing or approvals are copied. Review source descriptions before reusing with another Client.
          </p>
          {preview.data && <div className="mt-2 border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="text-xs font-semibold">Template Preview</div>
            <p className="mt-1 whitespace-pre-wrap text-[11px]" style={{ color: 'var(--text-3)' }}>{preview.data.snapshot.project_description}</p>
            {preview.data.snapshot.work_items.map((item, index) => <p key={index}
              className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{item.title} · {item.visibility}</p>)}
          </div>}
        </div>}
        <div>
          <label className="label" htmlFor="project-org">Client Organization</label>
          <select id="project-org" className="select" required value={orgId} onChange={e => setOrgId(e.target.value)}
            disabled={orgsLoading || orgs.length === 0}>
            <option value="">Select client</option>
            {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          {!orgsLoading && orgs.length === 0 && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>Add a client organization before creating a project.</p>}
        </div>
        <div>
          <label className="label" htmlFor="project-name">Project Name</label>
          <input id="project-name" className="input" required maxLength={200} autoFocus value={name}
            onChange={e => setName(e.target.value)} placeholder="Website redesign" />
        </div>
        <div>
          <label className="label" htmlFor="project-key">Project Key</label>
          <input id="project-key" className="input font-mono uppercase" required minLength={2} maxLength={12}
            pattern="[A-Z0-9]{2,12}" value={key} onChange={e => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="WEBSITE" />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>Unique within your workspace. Used for work item references such as WEBSITE-1.</p>
        </div>
        <div>
          <label className="label" htmlFor="project-desc">Description</label>
          <textarea id="project-desc" className="input min-h-[80px] resize-y" maxLength={5000}
            value={description} onChange={e => setDescription(e.target.value)} placeholder="What are we delivering?" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="project-visibility">Visibility</label>
            <select id="project-visibility" className="select" value={visibility}
              onChange={e => setVisibility(e.target.value as ProjectVisibility)}>
              <option value="internal">Internal</option>
              <option value="client">Client Visible</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="project-start">Start Date</label>
            <input id="project-start" className="input" type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}/>
          </div>
          <div>
            <label className="label" htmlFor="project-due">Due Date</label>
            <input id="project-due" className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <Footer busy={create.isPending || createFromTemplate.isPending}
          submit={templateId ? 'Create From Template' : 'Create Project'} onClose={onClose} />
      </form>
    </ProjectDialog>
  );
}

export function EditProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const update = useUpdateProject(project.id);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState<ProjectStatus>(['completed', 'archived'].includes(project.status) ? 'active' : project.status);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const [startDate, setStartDate] = useState(project.start_date || '');
  const [dueDate, setDueDate] = useState(project.due_date || '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await update.mutateAsync({
        name: name.trim(), description, status, visibility,
        start_date: startDate || null, due_date: dueDate || null,
      });
      onClose();
    } catch { /* Error is displayed below. */ }
  }

  return (
    <ProjectDialog title="Project Settings" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {update.error && <ProjectError error={update.error} />}
        <div>
          <label className="label" htmlFor="edit-project-name">Project Name</label>
          <input id="edit-project-name" className="input" autoFocus required maxLength={200}
            value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="edit-project-desc">Description</label>
          <textarea id="edit-project-desc" className="input min-h-[88px] resize-y"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="edit-project-status">Status</label>
            <select id="edit-project-status" className="select" value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATES.filter(s => !['completed', 'archived'].includes(s.value)).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="edit-project-visibility">Visibility</label>
            <select id="edit-project-visibility" className="select" value={visibility}
              onChange={e => setVisibility(e.target.value as ProjectVisibility)}>
              <option value="internal">Internal</option>
              <option value="client">Client Visible</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="edit-project-start">Start Date</label>
          <input id="edit-project-start" className="input" type="date"
            value={startDate} max={dueDate || undefined}
            onChange={e => setStartDate(e.target.value)}/>
        </div>
        <div>
          <label className="label" htmlFor="edit-project-due">Due Date</label>
          <input id="edit-project-due" className="input" type="date"
            value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <Footer busy={update.isPending} submit="Save Changes" onClose={onClose} />
      </form>
    </ProjectDialog>
  );
}

export function CreateMilestoneDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateMilestone(projectId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [visibility, setVisibility] = useState<WorkVisibility>('internal');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await create.mutateAsync({
        name: name.trim(), description, visibility,
        ...(startDate ? { start_date: startDate } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
      });
      onClose();
    } catch { /* Display mutation error. */ }
  }
  return (
    <ProjectDialog title="Create Milestone" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {create.error && <ProjectError error={create.error} />}
        <div>
          <label className="label" htmlFor="milestone-name">Milestone Name</label>
          <input id="milestone-name" className="input" required autoFocus maxLength={200}
            value={name} onChange={e => setName(e.target.value)} placeholder="Frontend complete" />
        </div>
        <div>
          <label className="label" htmlFor="milestone-description">Description</label>
          <textarea id="milestone-description" className="input min-h-[85px]"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="milestone-start">Start Date</label>
          <input id="milestone-start" className="input" type="date" value={startDate}
            max={dueDate || undefined} onChange={e => setStartDate(e.target.value)}/>
        </div>
        <div>
          <label className="label" htmlFor="milestone-due">Due Date</label>
          <input id="milestone-due" className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="milestone-visibility">Visibility</label>
          <select id="milestone-visibility" className="select" value={visibility}
            onChange={e => setVisibility(e.target.value as WorkVisibility)}>
            <option value="internal">Internal</option>
            <option value="client">Client Visible</option>
          </select>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Internal milestones are hidden from the Client Portal.
          </p>
        </div>
        <Footer busy={create.isPending} submit="Create Milestone" onClose={onClose} />
      </form>
    </ProjectDialog>
  );
}

export function CreateWorkItemDialog({ projectId, milestones, members, canManage, onClose }: {
  projectId: string; milestones: ProjectMilestone[]; members: ProjectMember[];
  canManage: boolean; onClose: () => void;
}) {
  const create = useCreateWorkItem(projectId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<WorkItemKind>('task');
  const [priority, setPriority] = useState<WorkItemPriority>('normal');
  const [milestoneId, setMilestoneId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimateHours, setEstimateHours] = useState('0');
  const [clientVisible, setClientVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await create.mutateAsync({
        title: title.trim(), description, kind, priority,
        ...(milestoneId ? { milestone_id: milestoneId } : {}),
        ...(assigneeId && canManage ? { assignee_id: assigneeId } : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
        estimated_minutes: Math.round(Number(estimateHours || 0) * 60),
        visibility: clientVisible && canManage ? 'client' : 'internal',
      });
      onClose();
    } catch { /* Display mutation error. */ }
  }
  return (
    <ProjectDialog title="Create Work Item" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {create.error && <ProjectError error={create.error} />}
        <div>
          <label className="label" htmlFor="work-title">Title</label>
          <input id="work-title" className="input" required autoFocus maxLength={300}
            value={title} onChange={e => setTitle(e.target.value)} placeholder="Implement checkout validation" />
        </div>
        <div>
          <label className="label" htmlFor="work-description">Description</label>
          <textarea id="work-description" className="input min-h-[100px] resize-y"
            value={description} onChange={e => setDescription(e.target.value)} placeholder="What needs to be done?" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="work-kind">Type</label>
            <select id="work-kind" className="select" value={kind} onChange={e => setKind(e.target.value as WorkItemKind)}>
              {WORK_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="work-priority">Priority</label>
            <select id="work-priority" className="select" value={priority} onChange={e => setPriority(e.target.value as WorkItemPriority)}>
              {WORK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="work-milestone">Milestone</label>
            <select id="work-milestone" className="select" value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
              <option value="">No milestone</option>
              {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="work-start">Start Date</label>
            <input id="work-start" className="input" type="date" value={startDate}
              max={dueDate || undefined} onChange={e => setStartDate(e.target.value)}/>
          </div>
          <div>
            <label className="label" htmlFor="work-hours">Estimated Hours</label>
            <input id="work-hours" className="input" type="number" min="0"
              max="16666" step="0.25" value={estimateHours}
              onChange={e => setEstimateHours(e.target.value)}/>
          </div>
          <div>
            <label className="label" htmlFor="work-due">Due Date</label>
            <input id="work-due" className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        {canManage && (
          <>
            <div>
              <label className="label" htmlFor="work-assignee">Assignee</label>
              <select id="work-assignee" className="select" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {members.filter(m => m.role === 'manager' || m.role === 'contributor').map(m => (
                  <option key={m.id} value={m.user}>{m.user_name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} />
              Visible to authorized client members
            </label>
          </>
        )}
        <Footer busy={create.isPending} submit="Create Work Item" onClose={onClose} />
      </form>
    </ProjectDialog>
  );
}

export function AddProjectMemberDialog({ projectId, existingMembers, onClose }: {
  projectId: string; existingMembers: ProjectMember[]; onClose: () => void;
}) {
  const { data: agents = [], isLoading, error: agentsError } = useAgents();
  const add = useAddProjectMember(projectId);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Extract<ProjectRole, 'manager' | 'contributor' | 'viewer'>>('contributor');
  const existing = new Set(existingMembers.map(member => member.user));
  const candidates = agents.filter(agent => !existing.has(agent.id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    try {
      await add.mutateAsync({ user_id: userId, role });
      onClose();
    } catch { /* Display mutation error. */ }
  }
  return (
    <ProjectDialog title="Add Team Member" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {agentsError && <ProjectError error={agentsError} />}
        {add.error && <ProjectError error={add.error} />}
        <div>
          <label className="label" htmlFor="member-user">Staff Member</label>
          <select id="member-user" className="select" required value={userId}
            onChange={e => setUserId(e.target.value)} disabled={isLoading || candidates.length === 0}>
            <option value="">Select a team member</option>
            {candidates.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
          </select>
          {!isLoading && !candidates.length && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>All available staff are already members.</p>}
        </div>
        <div>
          <label className="label" htmlFor="member-role">Project Role</label>
          <select id="member-role" className="select" value={role}
            onChange={e => setRole(e.target.value as typeof role)}>
            <option value="manager">Manager</option>
            <option value="contributor">Contributor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>This dialog assigns staff. For client access, use Team & Reviewers: Add Reviewer.</p>
        <Footer busy={add.isPending} submit="Add Member" onClose={onClose} />
      </form>
    </ProjectDialog>
  );
}
