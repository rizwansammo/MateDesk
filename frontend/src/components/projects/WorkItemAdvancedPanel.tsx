'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CheckSquare2, GitBranch, Plus, Trash2 } from 'lucide-react';
import type { Project, WorkItem } from '@/types/projects';
import { useProjectWorkItems } from '@/hooks/useProjects';
import {
  useWorkItemDependencies, useAddWorkItemDependency, useRemoveWorkItemDependency,
  useWorkItemChecklist, useAddWorkItemChecklist, useUpdateWorkItemChecklist,
  useRemoveWorkItemChecklist,
} from '@/hooks/useWorkItemAdvanced';
import { ProjectError, StatePill } from './ProjectUI';

export function WorkItemProgressBadge({ item }: { item: WorkItem }) {
  if (!item.is_blocked && !item.checklist_total) return null;
  return <span className="inline-flex flex-wrap items-center gap-2 text-[11px]">
    {item.is_blocked && <span className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-semibold"
      style={{ borderColor: 'var(--accent-warn-fg)', background: 'var(--accent-warn-bg)',
        color: 'var(--accent-warn-fg)' }} title="Waiting for prerequisite Work Items">
      <AlertTriangle size={12}/> Blocked
    </span>}
    {item.checklist_total > 0 && <span className="inline-flex items-center gap-1"
      style={{ color: 'var(--text-3)' }} title="Checklist progress">
      <CheckSquare2 size={12}/> {item.checklist_completed}/{item.checklist_total}
    </span>}
  </span>;
}

export function WorkItemAdvancedPanel({ item, project }: {
  item: WorkItem; project: Project;
}) {
  const [dependencyId, setDependencyId] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'client'>('internal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dependencies = useWorkItemDependencies(item.id);
  const checklist = useWorkItemChecklist(item.id);
  const projectItems = useProjectWorkItems(project.id);
  const addDependency = useAddWorkItemDependency(project.id, item.id);
  const removeDependency = useRemoveWorkItemDependency(project.id, item.id);
  const addEntry = useAddWorkItemChecklist(project.id, item.id);
  const updateEntry = useUpdateWorkItemChecklist(project.id, item.id);
  const removeEntry = useRemoveWorkItemChecklist(project.id, item.id);
  const canEdit = project.can_edit && !['completed','archived'].includes(project.status) &&
    !['done','cancelled'].includes(item.status);
  const busy = addDependency.isPending || removeDependency.isPending ||
    addEntry.isPending || updateEntry.isPending || removeEntry.isPending;
  const alreadyLinked = new Set((dependencies.data || []).map(edge => edge.prerequisite_id));
  const candidates = (projectItems.data || []).filter(candidate =>
    candidate.id !== item.id && !alreadyLinked.has(candidate.id) &&
    (candidate.status === 'done' || !['in_progress', 'in_review'].includes(item.status)));
  const entries = checklist.data || [];
  const done = entries.filter(entry => entry.is_done).length;

  async function action(task: () => Promise<unknown>, success: string) {
    setError(''); setMessage('');
    try { await task(); setMessage(success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The update could not be saved.'); }
  }
  async function submitDependency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dependencyId) return;
    const selected = dependencyId;
    await action(() => addDependency.mutateAsync(selected), 'Dependency added.');
    setDependencyId('');
  }
  async function submitChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await action(() => addEntry.mutateAsync({
      title: title.trim(), visibility: project.can_manage && item.visibility === 'client' ? visibility : 'internal',
    }), 'Checklist step added.');
    setTitle('');
  }
  async function editEntry(entryId: string, changes: { title?: string; is_done?: boolean; visibility?: 'internal'|'client' }) {
    await action(() => updateEntry.mutateAsync({ entryId, changes }), 'Checklist updated.');
    setEditingId(null);
  }

  return <div className="flex min-w-0 flex-col gap-3">
    {error && <ProjectError error={new Error(error)}/>}
    {message && <p role="status" className="border p-3 text-xs"
      style={{ color: 'var(--accent-ok-fg)', borderColor: 'var(--border-subtle)' }}>{message}</p>}

    <section className="panel min-w-0">
      <div className="panel-header flex-wrap gap-2">
        <span className="panel-title inline-flex items-center gap-2"><GitBranch size={15}/> Dependencies</span>
        <WorkItemProgressBadge item={item}/>
      </div>
      <div className="space-y-3 p-3">
        <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
          A Work Item cannot start or finish until its prerequisites are Done. The Blocked indicator updates automatically.
        </p>
        {dependencies.isLoading && <p className="text-xs">Loading dependencies…</p>}
        {dependencies.isError && <ProjectError error={dependencies.error} retry={() => { void dependencies.refetch(); }}/>}
        {dependencies.data?.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>No prerequisites.</p>}
        {dependencies.data?.map((edge,index) => <div key={edge.id || index}
          className="flex flex-wrap items-center gap-2 border p-2 text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="min-w-0 flex-1 break-words">
            {edge.prerequisite_id
              ? <Link href={`/projects/${project.id}/work-items/${edge.prerequisite_id}`}
                  style={{ color: 'var(--accent-info-fg)' }}>{edge.ref} · {edge.title}</Link>
              : 'Internal Project Work'}
          </div>
          {edge.internal ? <StatePill value="on_hold" label="Team Only"/> :
            edge.completed ? <span className="inline-flex items-center gap-1"
              style={{ color: 'var(--accent-ok-fg)' }}><Check size={12}/> Done</span>
              : <StatePill value={edge.status || 'on_hold'}/>}
          {canEdit && edge.id && <button type="button" className="icon-btn" disabled={busy}
            aria-label={`Remove dependency ${edge.ref}`}
            onClick={() => { void action(() => removeDependency.mutateAsync(edge.id!), 'Dependency removed.'); }}>
            <Trash2 size={14}/></button>}
        </div>)}
        {canEdit && <form onSubmit={submitDependency} className="flex flex-wrap items-end gap-2 border-t pt-3"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="min-w-[180px] flex-1">
            <label className="label" htmlFor="work-dependency">Add Prerequisite</label>
            <select className="select w-full" id="work-dependency" value={dependencyId}
              disabled={busy} onChange={e => setDependencyId(e.target.value)}>
              <option value="">Choose Work Item</option>
              {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
                {candidate.ref} · {candidate.title} ({candidate.status.replace(/_/g,' ')})
              </option>)}
            </select>
          </div>
          <button className="btn-secondary inline-flex items-center gap-1" type="submit"
            disabled={!dependencyId || busy}><Plus size={13}/> Add Dependency</button>
        </form>}
      </div>
    </section>

    <section className="panel min-w-0">
      <div className="panel-header flex-wrap gap-2">
        <span className="panel-title inline-flex items-center gap-2"><CheckSquare2 size={15}/> Checklist</span>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{done}/{entries.length} complete</span>
      </div>
      <div className="space-y-3 p-3">
        <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
          All checklist steps must be completed before the Work Item can be marked Done.
        </p>
        {entries.length > 0 && <div className="h-1.5" style={{ background: 'var(--bg-elevated)' }}>
          <div className="h-full" style={{
            background: 'var(--accent-ok-fg)',
            width: `${Math.round(done * 100 / entries.length)}%`,
          }}/>
        </div>}
        {checklist.isLoading && <p className="text-xs">Loading checklist…</p>}
        {checklist.isError && <ProjectError error={checklist.error} retry={() => { void checklist.refetch(); }}/>}
        {checklist.data?.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>No checklist steps.</p>}
        {entries.map(entry => <div key={entry.id} className="flex min-w-0 flex-wrap items-center gap-2 border-b py-2"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <input type="checkbox" aria-label={`Complete ${entry.title}`} checked={entry.is_done}
            disabled={!canEdit || busy}
            onChange={e => { void editEntry(entry.id, { is_done: e.target.checked }); }}/>
          <div className="min-w-[150px] flex-1">
            {editingId === entry.id && canEdit ? <form className="flex items-center gap-2"
              onSubmit={e => { e.preventDefault(); if(editTitle.trim()) void editEntry(entry.id,{title:editTitle.trim()}); }}>
              <input className="input min-w-0 flex-1" maxLength={255} value={editTitle}
                onChange={e => setEditTitle(e.target.value)}/>
              <button type="submit" className="btn-primary" disabled={busy || !editTitle.trim()}>Save</button>
              <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
            </form> : <button type="button" disabled={!canEdit || busy}
              className={`break-words text-left text-xs ${entry.is_done ? 'line-through':''}`}
              style={{ color: entry.is_done ? 'var(--text-3)' : 'var(--text-1)' }}
              title={canEdit ? 'Edit checklist step' : undefined}
              onClick={() => { setEditingId(entry.id); setEditTitle(entry.title); }}>{entry.title}</button>}
            {entry.completed_at && <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Completed by {entry.completed_by_name || 'Team Member'}
            </p>}
          </div>
          {project.can_manage && canEdit && <select className="select w-auto text-[11px]" disabled={busy}
            aria-label={`Visibility for ${entry.title}`} value={entry.visibility}
            onChange={e => { void editEntry(entry.id,{visibility:e.target.value as 'internal'|'client'}); }}>
            <option value="internal">Internal</option>
            {item.visibility === 'client' && <option value="client">Client Visible</option>}
          </select>}
          {canEdit && <button type="button" className="icon-btn" disabled={busy}
            aria-label={`Remove checklist step ${entry.title}`}
            onClick={() => { if(window.confirm('Remove checklist step?')) void action(
              () => removeEntry.mutateAsync(entry.id), 'Checklist step removed.'); }}>
            <Trash2 size={14}/></button>}
        </div>)}
        {canEdit && <form className="flex flex-wrap items-end gap-2 border-t pt-3"
          onSubmit={submitChecklist} style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="min-w-[160px] flex-1">
            <label className="label" htmlFor="work-checklist-new">New Checklist Step</label>
            <input id="work-checklist-new" className="input w-full" maxLength={255}
              placeholder="Describe a task step" value={title} onChange={e => setTitle(e.target.value)}/>
          </div>
          {project.can_manage && item.visibility === 'client' && <select className="select w-auto"
            aria-label="New checklist visibility" value={visibility}
            onChange={e => setVisibility(e.target.value as 'internal'|'client')}>
            <option value="internal">Internal</option><option value="client">Client Visible</option>
          </select>}
          <button type="submit" className="btn-secondary inline-flex items-center gap-1"
            disabled={busy || !title.trim()}><Plus size={13}/> Add Step</button>
        </form>}
      </div>
    </section>
  </div>;
}
