'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FilePlus2, FolderKanban, Send } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCreateProjectRequest } from '@/hooks/useProjectRequests';
import type { Currency, ProjectRequestKind } from '@/types/projectRequests';

const KINDS: { value: ProjectRequestKind; label: string }[] = [
  { value: 'web_development', label: 'Web Development' },
  { value: 'app_development', label: 'App Development' },
  { value: 'website_redesign', label: 'Website Redesign' },
  { value: 'infrastructure', label: 'Infrastructure & Cloud' },
  { value: 'other', label: 'Other Project' },
];
const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BDT'];

export default function NewProjectRequestPage() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const create = useCreateProjectRequest();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectRequestKind>('web_development');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [expectedDate, setExpectedDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [validation, setValidation] = useState('');

  const isClient = user?.role === 'client_owner' || user?.role === 'end_user';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    if (!name.trim() || !description.trim()) {
      setValidation('Project name and description are required.');
      return;
    }
    if (files.length > 5 || files.some(file => file.size > 10 * 1024 * 1024)) {
      setValidation('Choose up to five files, each smaller than 10 MB.');
      return;
    }
    const payload = new FormData();
    payload.set('name', name.trim());
    payload.set('kind', kind);
    payload.set('description', description.trim());
    payload.set('requirements', requirements.trim());
    payload.set('budget_currency', currency);
    if (budget) payload.set('budget', budget);
    if (expectedDate) payload.set('expected_date', expectedDate);
    files.forEach(file => payload.append('attachments', file));
    try {
      const response = await create.mutateAsync(payload);
      router.push('/requests/project/' + response.id);
    } catch { /* The mutation error is shown underneath the form. */ }
  }

  if (!isClient) return (
    <div className="p-6 text-sm" style={{ color: 'var(--text-2)' }}>
      Project Requests are submitted from a client account.
      <Link href="/requests" className="ml-2 underline">Back to Requests</Link>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5" style={{ background: 'var(--bg-base)' }}>
      <div className="mx-auto max-w-[780px] space-y-4">
        <Link href="/requests" className="inline-flex items-center gap-2 text-xs"
          style={{ color: 'var(--text-3)' }}><ArrowLeft size={14} /> Requests</Link>
        <div>
          <div className="flex items-center gap-2" style={{ color: 'var(--accent-info-fg)' }}>
            <FolderKanban size={17} /><span className="text-xs font-semibold">PROJECT REQUEST</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-0)' }}>Request New Project</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Tell your support team what you need. An agent will review your request before a Project is created.
          </p>
        </div>
        <form onSubmit={submit} className="panel space-y-4 p-4 md:p-5">
          <div>
            <label className="label" htmlFor="request-name">Project Name *</label>
            <input id="request-name" className="input w-full" required maxLength={200}
              value={name} onChange={event => setName(event.target.value)}
              placeholder="New E-commerce Website" />
          </div>
          <div>
            <label className="label" htmlFor="request-kind">Project Type *</label>
            <select id="request-kind" className="select w-full" value={kind}
              onChange={event => setKind(event.target.value as ProjectRequestKind)}>
              {KINDS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="request-description">Description *</label>
            <textarea id="request-description" className="input min-h-[120px] w-full resize-y"
              required maxLength={5000} value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Describe the goal and what you would like us to deliver." />
          </div>
          <div>
            <label className="label" htmlFor="request-requirements">Requirements</label>
            <textarea id="request-requirements" className="input min-h-[120px] w-full resize-y"
              maxLength={12000} value={requirements}
              onChange={event => setRequirements(event.target.value)}
              placeholder="Pages, features, integrations or technical preferences." />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="request-budget">Estimated Budget (optional)</label>
              <div className="flex gap-2">
                <select aria-label="Currency" className="select w-[94px]" value={currency}
                  onChange={event => setCurrency(event.target.value as Currency)}>
                  {CURRENCIES.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
                <input id="request-budget" type="number" min="0.01" step="0.01"
                  className="input min-w-0 flex-1" value={budget}
                  onChange={event => setBudget(event.target.value)} placeholder="Not decided" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="request-date">Preferred Deadline (optional)</label>
              <input id="request-date" type="date" className="input w-full"
                value={expectedDate} onChange={event => setExpectedDate(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="request-files">Attachments (optional)</label>
            <label className="flex cursor-pointer items-center gap-2 border border-dashed p-3"
              style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)' }}>
              <FilePlus2 size={17} />
              <span className="text-xs">{files.length ? files.map(file => file.name).join(', ') : 'Add images, PDF, Word or spreadsheet files'}</span>
              <input id="request-files" type="file" multiple
                accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.docx,.xlsx"
                className="sr-only" onChange={event => setFiles(Array.from(event.target.files ?? []))}/>
            </label>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>Maximum five files, 10 MB each.</p>
          </div>
          {(validation || create.error) && (
            <p role="alert" className="text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
              {validation || (create.error instanceof Error ? create.error.message : 'Unable to submit request.')}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
            <Link href="/requests" className="btn-secondary">Cancel</Link>
            <button type="submit" className="btn-primary gap-2" disabled={create.isPending}>
              <Send size={14}/>{create.isPending ? 'Submitting…' : 'Submit Project Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
