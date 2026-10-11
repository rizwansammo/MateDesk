'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, ChevronLeft, ChevronRight, ImagePlus,
  LifeBuoy, Plus, RefreshCw, Send,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Project, WorkItem } from '@/types/projects';
import {
  useCreateProjectSupportTicket, useProjectSupportTickets,
} from '@/hooks/useProjectOperations';
import { ProjectEmpty, ProjectError, ProjectLoading, StatePill } from './ProjectUI';

export function ProjectSupportPanel({
  project, workItems = [],
}: { project: Project; workItems?: WorkItem[] }) {
  const router = useRouter();
  const isClient = project.my_role === 'client_reviewer';
  const canCreate = isClient && project.visibility === 'client' && project.status !== 'archived';
  const [page, setPage] = useState(1);
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [workItemId, setWorkItemId] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const tickets = useProjectSupportTickets(project.id, page);
  const create = useCreateProjectSupportTicket(project.id);
  const count = tickets.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / 25));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!subject.trim() || !description.trim()) {
      setErrorMessage('Enter a subject and description.');
      return;
    }
    if (images.length > 5 || images.some(file => file.size <= 0 || file.size > 10 * 1024 * 1024)) {
      setErrorMessage('Choose up to five images, maximum 10 MB each.');
      return;
    }
    const payload = new FormData();
    payload.set('subject', subject.trim());
    payload.set('description', description.trim());
    payload.set('priority', priority);
    if (workItemId) payload.set('work_item_id', workItemId);
    images.forEach(file => payload.append('images', file));
    try {
      const created = await create.mutateAsync(payload);
      router.push('/requests/' + created.ref);
    } catch {
      // The mutation error is displayed below the form.
    }
  }

  return (
    <div className="mx-auto flex max-w-[1250px] flex-col gap-3">
      <section className="panel">
        <div className="panel-header flex-wrap gap-3">
          <div>
            <h2 className="panel-title">Project Support</h2>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Every Support Ticket is linked to {project.key} and remains in Requests.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="icon-btn" aria-label="Refresh Project Tickets"
              title="Refresh" onClick={() => { void tickets.refetch(); }}>
              <RefreshCw size={15} className={tickets.isFetching ? 'animate-spin' : ''}/>
            </button>
            {canCreate && <button type="button" className="btn-primary gap-1.5"
              onClick={() => setCompose(value => !value)}>
              <Plus size={13}/> {compose ? 'Hide Form' : 'New Support Ticket'}
            </button>}
          </div>
        </div>
        {compose && canCreate && (
          <form onSubmit={submit} className="space-y-3 border-b p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-md)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}>
              <LifeBuoy size={15} style={{ color: 'var(--accent-info-fg)' }}/>
              New Project Support Ticket
            </div>
            <div>
              <label htmlFor="project-support-subject" className="label">Subject *</label>
              <input id="project-support-subject" className="input w-full" required
                maxLength={500} value={subject} onChange={event => setSubject(event.target.value)}
                placeholder="Checkout page gives an error"/>
            </div>
            <div>
              <label htmlFor="project-support-description" className="label">Description *</label>
              <textarea id="project-support-description" className="input min-h-[110px] w-full resize-y"
                required maxLength={10000} value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Describe the issue, expected behavior and steps to reproduce."/>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="project-support-priority" className="label">Priority</label>
                <select id="project-support-priority" className="select w-full" value={priority}
                  onChange={event => setPriority(event.target.value as typeof priority)}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label htmlFor="project-support-work-item" className="label">Related Work Item (optional)</label>
                <select id="project-support-work-item" className="select w-full" value={workItemId}
                  onChange={event => setWorkItemId(event.target.value)}>
                  <option value="">General Project Support</option>
                  {workItems.filter(item => item.visibility === 'client').map(item => (
                    <option key={item.id} value={item.id}>{item.ref} · {item.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="project-support-attachments" className="label">Screenshots (optional)</label>
              <label className="flex cursor-pointer items-center gap-2 border p-3 text-xs"
                style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)' }}>
                <ImagePlus size={15}/>
                {images.length ? images.map(file => file.name).join(', ') : 'Attach up to five screenshots'}
                <input id="project-support-attachments" type="file" multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp" className="sr-only"
                  onChange={event => setImages(Array.from(event.target.files ?? []))}/>
              </label>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>Each image must be 10 MB or smaller.</p>
            </div>
            {(errorMessage || create.error) && <p role="alert" className="text-xs"
              style={{ color: 'var(--accent-danger-fg)' }}>
              {errorMessage || (create.error instanceof Error ? create.error.message : 'Unable to create ticket.')}
            </p>}
            <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <button type="button" className="btn-secondary" onClick={() => setCompose(false)}>Cancel</button>
              <button type="submit" className="btn-primary gap-1.5" disabled={create.isPending}>
                <Send size={13}/>{create.isPending ? 'Creating…' : 'Submit Support Ticket'}
              </button>
            </div>
          </form>
        )}
        {tickets.isLoading ? <ProjectLoading text="Loading Project Tickets…"/> :
          tickets.isError ? <div className="p-3"><ProjectError error={tickets.error}
            retry={() => { void tickets.refetch(); }}/></div> :
          tickets.data?.results.length === 0 ?
            <ProjectEmpty title="No Project Support Tickets"
              description="Project Support requests and their responses will appear here."/> :
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr>
                  <th>Ticket</th><th>Subject</th><th>Requester</th>
                  <th>Assigned To</th><th>Status</th><th>Priority</th><th aria-label="Open"/>
                </tr></thead>
                <tbody>
                  {tickets.data?.results.map(ticket => (
                    <tr key={ticket.id}>
                      <td className="whitespace-nowrap font-mono text-[11px]"
                        style={{ color: 'var(--text-3)' }}>{ticket.ref}</td>
                      <td><Link href={'/requests/' + ticket.ref} className="font-medium hover:underline"
                        style={{ color: 'var(--text-1)' }}>{ticket.subject}</Link></td>
                      <td className="text-xs">{ticket.requester || 'Client'}</td>
                      <td className="text-xs">{ticket.assignee || 'Unassigned'}</td>
                      <td><StatePill value={ticket.status}/></td>
                      <td><StatePill value={ticket.priority}/></td>
                      <td><Link href={'/requests/' + ticket.ref} aria-label={'Open ' + ticket.ref}
                        style={{ color: 'var(--text-3)' }}><ArrowUpRight size={15}/></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
        {count > 25 && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs"
            style={{ color: 'var(--text-3)', borderColor: 'var(--border-subtle)' }}>
            <span>{count} tickets · Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button className="pagination-btn" aria-label="Previous tickets page" disabled={page <= 1}
                onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={14}/></button>
              <button className="pagination-btn" aria-label="Next tickets page" disabled={page >= totalPages}
                onClick={() => setPage(value => value + 1)}><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
