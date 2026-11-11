'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Copy, FolderPlus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { Project } from '@/types/projects';
import {
  useProjectTemplates, useCaptureProjectTemplate, useApplyProjectTemplate,
  useDeleteProjectTemplate, useProjectTemplatePreview,
} from '@/hooks/useProjectInsights';
import { ProjectError, ProjectLoading } from './ProjectUI';

export function ProjectTemplatesPanel({ project, milestonesCount, workCount }: {
  project: Project; milestonesCount: number; workCount: number;
}) {
  const templates = useProjectTemplates();
  const capture = useCaptureProjectTemplate(project.id);
  const apply = useApplyProjectTemplate(project.id);
  const remove = useDeleteProjectTemplate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');
  const preview = useProjectTemplatePreview(templateId, Boolean(templateId));
  const [notice, setNotice] = useState('');
  const isEmpty = project.status === 'planned' && milestonesCount === 0 && workCount === 0;
  const error = capture.error || apply.error || remove.error;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || capture.isPending) return;
    try {
      await capture.mutateAsync({ name: name.trim(), description: description.trim() });
      setName('');
      setDescription('');
      setNotice('Reusable Template saved. Staff assignments and financial history are not included.');
    } catch {
      // Validation error shown below.
    }
  }
  async function instantiate() {
    const selected = templates.data?.find(t => t.id === templateId);
    if (!selected || !isEmpty) return;
    if (!window.confirm(`Apply "${selected.name}" to this empty Project? This will create ${selected.work_item_count} Work Items and ${selected.milestone_count} Milestones.`)) return;
    try {
      const result = await apply.mutateAsync(templateId);
      setNotice(`Template applied: ${result.milestones_created} Milestones and ${result.work_items_created} Work Items created.`);
    } catch {
      // Validation error shown below.
    }
  }
  async function erase(id: string, label: string) {
    if (!window.confirm(`Delete reusable Template "${label}"? Existing Projects will not be changed.`)) return;
    try {
      await remove.mutateAsync(id);
      setNotice('Template removed. Existing Projects remain unchanged.');
      if (templateId === id) setTemplateId('');
    } catch {
      // API error shown.
    }
  }

  return <div className="w-full min-w-0 space-y-3">
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title inline-flex items-center gap-2">
            <Save size={15}/> Save Project Template
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Store a reusable copy of your Project structure for future clients.
          </p>
        </div>
      </div>
      {error && <div className="p-3"><ProjectError error={error}/></div>}
      {notice && <p role="status" className="p-3 text-xs"
        style={{ color: 'var(--accent-ok-fg)' }}>{notice}</p>}
      <form onSubmit={save} className="space-y-3 p-3">
        <div>
          <label htmlFor="project-template-name" className="label">Template Name</label>
          <input id="project-template-name" className="input w-full" required
            maxLength={160} value={name} onChange={e => setName(e.target.value)}
            placeholder="Standard Website Delivery"/>
        </div>
        <div>
          <label htmlFor="project-template-desc" className="label">Description</label>
          <textarea id="project-template-desc" className="input min-h-[75px] w-full"
            maxLength={2000} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="When should this template be used?"/>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Captures Milestones, Work Items, Checklists, Dependencies and relative dates. Resets all progress.
          </p>
          <button type="submit" className="btn-primary inline-flex items-center gap-2"
            disabled={!name.trim() || capture.isPending}><Save size={13}/>
            {capture.isPending ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </form>
    </section>
    <section className="panel">
      <div className="panel-header flex-wrap gap-2">
        <h2 className="panel-title inline-flex items-center gap-2"><Copy size={15}/> Reusable Templates</h2>
        <button className="btn-secondary inline-flex items-center gap-1 text-xs"
          type="button" onClick={() => void templates.refetch()}><RefreshCw size={13}/> Refresh</button>
      </div>
      {templates.isLoading ? <ProjectLoading text="Loading reusable templates…"/> :
        templates.isError ? <div className="p-3"><ProjectError error={templates.error}/></div> :
        !templates.data?.length ? <p className="p-6 text-xs" style={{ color: 'var(--text-3)' }}>
          No saved templates yet. Save this Project as your first Template.
        </p> : <>
          <div className="space-y-2 p-3">
            {templates.data.map(row => <div key={row.id}
              className="flex flex-wrap items-start justify-between gap-2 border p-3"
              style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{row.name}</div>
                {row.description && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                  {row.description}
                </p>}
                <p className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {row.milestone_count} Milestones · {row.work_item_count} Work Items
                </p>
              </div>
              <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
                disabled={remove.isPending} onClick={() => void erase(row.id, row.name)}>
                <Trash2 size={12}/> Delete
              </button>
            </div>)}
          </div>
          <div className="border-t p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Apply Template To This Project
            </h3>
            {isEmpty ? <>
              <p className="mb-3 text-xs" style={{ color: 'var(--text-3)' }}>
                Apply once to an empty Planned Project. Or create a new Project from a Template on the Projects page.
              </p>
              <p className="mb-3 text-[11px]" style={{ color: 'var(--accent-warn-fg)' }}>
                Review Template descriptions before applying to a different Client. Templates may contain client specific details.
              </p>
              <div className="flex flex-wrap gap-2">
                <select className="select min-w-[220px] flex-1" aria-label="Choose Project Template"
                  value={templateId} onChange={e => setTemplateId(e.target.value)}>
                  <option value="">Select a Template</option>
                  {templates.data.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
                <button type="button" className="btn-primary inline-flex items-center gap-1"
                  disabled={!templateId || apply.isPending}
                  onClick={() => void instantiate()}><FolderPlus size={13}/>
                  {apply.isPending ? 'Applying…' : 'Apply Template'}
                </button>
              </div>
              {preview.data && <div className="mt-3 border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <h4 className="mb-2 text-xs font-semibold">Template Preview</h4>
                {preview.data.snapshot.project_description && <p className="mb-2 text-xs whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>{preview.data.snapshot.project_description}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  <div><h5 className="text-xs font-semibold">Milestones</h5>
                    {preview.data.snapshot.milestones.map((row, i) => <p key={i} className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{row.name} · {row.visibility}</p>)}
                  </div>
                  <div><h5 className="text-xs font-semibold">Work Items</h5>
                    {preview.data.snapshot.work_items.map((row, i) => <p key={i} className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{row.title} · {row.visibility}</p>)}
                  </div>
                </div>
              </div>}
              {preview.isError && <ProjectError error={preview.error}/>}
            </> : <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Only empty Planned Projects can receive a Template. To reuse a Template, create a new Project.
            </p>}
          </div>
        </>}
    </section>
    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
      Templates do not copy Client Organizations, Staff Assignments, Tickets, Time Entries, Invoices, Files, Scope Approvals or Delivery Decisions. <Link className="underline"
        href="/projects">Create a new Project</Link>
    </p>
  </div>;
}
