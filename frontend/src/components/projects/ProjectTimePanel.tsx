'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CalendarClock, Check, ChevronLeft, ChevronRight, Clock3,
  FileText, Pencil, RefreshCw, Send, X,
} from 'lucide-react';
import type { Project, WorkItem } from '@/types/projects';
import {
  useCreateProjectTimeInvoice, useEditProjectTime, useLogProjectTime,
  useProjectTimeEntries, useProjectTimeInvoices, useProjectTimeRate,
  useProjectTimeSummary, useReviewProjectTime, useSaveProjectTimeRate,
  useVoidProjectTimeInvoice, type ProjectTimeEntry,
} from '@/hooks/useProjectTime';
import { ProjectError, ProjectLoading } from './ProjectUI';

const CURRENCIES = [
  'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD',
  'SGD', 'AED', 'INR', 'PKR', 'BDT',
] as const;

function minutesLabel(value: number) {
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return hours > 0 ? `${hours}h ${rest ? `${rest}m` : ''}` : `${rest}m`;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function ProjectTimePanel({
  project, workItems, workItemId,
}: {
  project: Project;
  workItems: WorkItem[];
  workItemId?: string;
}) {
  const compact = Boolean(workItemId);
  const manager = project.can_manage;
  const [page, setPage] = useState(1);
  const entries = useProjectTimeEntries(project.id, page, workItemId);
  const summary = useProjectTimeSummary(project.id, !compact);
  const rate = useProjectTimeRate(project.id, manager && !compact);
  const invoices = useProjectTimeInvoices(project.id, manager && !compact);
  const createEntry = useLogProjectTime(project.id);
  const updateEntry = useEditProjectTime(project.id);
  const reviewEntry = useReviewProjectTime(project.id);
  const updateRate = useSaveProjectTimeRate(project.id);
  const createInvoice = useCreateProjectTimeInvoice(project.id);
  const voidInvoice = useVoidProjectTimeInvoice(project.id);

  const [itemId, setItemId] = useState(workItemId || workItems[0]?.id || '');
  const [spentOn, setSpentOn] = useState(today);
  const [minutes, setMinutes] = useState('60');
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(false);
  const [entryRequest, setEntryRequest] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [rateLoaded, setRateLoaded] = useState(false);
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [taxRate, setTaxRate] = useState('0');
  const [invoiceRequest, setInvoiceRequest] = useState<string | null>(null);
  const [invoiceCreated, setInvoiceCreated] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ProjectTimeEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBillable, setEditBillable] = useState(false);
  const totalPages = Math.max(1, Math.ceil((entries.data?.count ?? 0) / 25));

  useEffect(() => {
    if (rate.data && !rateLoaded) {
      setRateValue(rate.data.hourly_rate || '');
      setCurrency(rate.data.currency || 'USD');
      setRateLoaded(true);
    }
  }, [rate.data, rateLoaded]);

  function resetEntryRequest() {
    setEntryRequest(null);
    setNotice('');
  }

  async function postEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createEntry.isPending || !itemId || !description.trim()) return;
    const requestId = entryRequest || crypto.randomUUID();
    setEntryRequest(requestId);
    try {
      await createEntry.mutateAsync({
        work_item_id: itemId, spent_on: spentOn,
        minutes: Number(minutes), description: description.trim(),
        billable, request_id: requestId,
      });
      setEntryRequest(null);
      setDescription('');
      setMinutes('60');
      setNotice(manager ? 'Time recorded and approved.' : 'Time recorded for manager review.');
      setPage(1);
    } catch {
      // The request ID is retained for safe retries.
    }
  }

  async function saveTimeEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || updateEntry.isPending) return;
    try {
      await updateEntry.mutateAsync({
        id: editing.id,
        changes: {
          spent_on: editDate, minutes: Number(editMinutes),
          description: editDescription.trim(), billable: editBillable,
        },
      });
      setEditing(null);
      setNotice('Time entry updated.');
    } catch {
      // Error shown beside the form.
    }
  }

  function startEdit(row: ProjectTimeEntry) {
    setEditing(row);
    setEditDate(row.spent_on);
    setEditMinutes(String(row.minutes));
    setEditDescription(row.description);
    setEditBillable(row.billable);
  }

  async function submitRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateRate.mutateAsync({ hourly_rate: rateValue, currency });
      setNotice('Project hourly rate saved. Existing invoices remain unchanged.');
    } catch {
      // Error shown next to rate fields.
    }
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInvoice.isPending) return;
    const requestId = invoiceRequest || crypto.randomUUID();
    setInvoiceRequest(requestId);
    try {
      const invoice = await createInvoice.mutateAsync({
        period_from: fromDate, period_to: toDate, tax_rate: taxRate,
        request_id: requestId,
      });
      setInvoiceCreated(invoice.invoice_number);
      setInvoiceRequest(null);
      setNotice(`Draft invoice ${invoice.invoice_number} created for approved billable time.`);
    } catch {
      // Preserve invoice request UUID for safe retry.
    }
  }

  async function voidDraft(invoiceId: string, number: string) {
    if (!window.confirm(`Void draft invoice ${number} and release its time entries?`)) return;
    try {
      await voidInvoice.mutateAsync(invoiceId);
      setNotice(`Draft ${number} voided. Its time entries can be billed again.`);
    } catch {
      // Error displayed inline.
    }
  }

  const currentError = createEntry.error || updateEntry.error || reviewEntry.error ||
    updateRate.error || createInvoice.error || voidInvoice.error;
  const canLog = project.status !== 'archived' && project.can_edit;
  const rows = entries.data?.results || [];

  return <div className="w-full min-w-0 space-y-3">
    {!compact && <section className="panel">
      <div className="panel-header flex-wrap gap-2">
        <div>
          <h2 className="panel-title inline-flex items-center gap-2">
            <CalendarClock size={15}/> Project Time & Billing
          </h2>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Staff time is separate from Support Ticket hours. Only approved billable entries can be invoiced.
          </p>
        </div>
        <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
          onClick={() => { void entries.refetch(); void summary.refetch(); }}>
          <RefreshCw size={13}/> Refresh
        </button>
      </div>
      {summary.isLoading ? <ProjectLoading text="Loading time summary…"/> :
        summary.isError ? <div className="p-3"><ProjectError error={summary.error}/></div> :
        summary.data && <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
          {[
            ['Total Time', minutesLabel(summary.data.total_minutes)],
            ['Billable', minutesLabel(summary.data.billable_minutes)],
            ['Non Billable', minutesLabel(summary.data.non_billable_minutes)],
            ['Pending Review', minutesLabel(summary.data.pending_minutes)],
          ].map(([label, value]) => <div className="border p-3" key={label}
            style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-0)' }}>{value}</div>
          </div>)}
          {manager && <div className="col-span-2 border p-3 lg:col-span-4"
            style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>Approved Unbilled Time</div>
            <strong className="text-sm" style={{ color: 'var(--text-1)' }}>
              {minutesLabel(summary.data.ready_minutes || 0)}
              {summary.data.estimated_unbilled_amount &&
                ` · ${summary.data.estimated_unbilled_amount} ${summary.data.currency}`}
            </strong>
          </div>}
        </div>}
      {summary.data && <div className="grid grid-cols-1 gap-3 border-t p-3 md:grid-cols-2"
        style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>By Staff</div>
          {summary.data.by_staff.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>No staff time yet.</p> :
            summary.data.by_staff.map(row => <div key={row.staff_name}
              className="flex justify-between py-1 text-xs" style={{ color: 'var(--text-2)' }}>
              <span>{row.staff_name}</span><span>{minutesLabel(row.minutes)}</span>
            </div>)}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>By Work Item</div>
          {summary.data.by_work_item.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>No Work Item time yet.</p> :
            summary.data.by_work_item.map(row => <div key={row.work_item_id}
              className="flex justify-between py-1 text-xs" style={{ color: 'var(--text-2)' }}>
              <Link href={`/projects/${project.id}/work-items/${row.work_item_id}`}
                className="hover:underline">{row.work_item_ref}</Link>
              <span>{minutesLabel(row.minutes)}</span>
            </div>)}
        </div>
      </div>}
    </section>}

    {currentError && <ProjectError error={currentError}/>}
    {notice && <p className="text-xs" role="status"
      style={{ color: 'var(--accent-ok-fg)' }}>{notice}</p>}

    {canLog && <section className="panel">
      <div className="panel-header"><h3 className="panel-title inline-flex items-center gap-2">
        <Clock3 size={14}/> {compact ? 'Work Item Time Log' : 'Log Project Time'}
      </h3></div>
      <form onSubmit={postEntry} className="space-y-3 p-3">
        {!compact && <div>
          <label className="label" htmlFor="project-time-item">Work Item</label>
          <select id="project-time-item" className="select" required value={itemId}
            onChange={event => { setItemId(event.target.value); resetEntryRequest(); }}>
            {!itemId && <option value="">Select a Work Item</option>}
            {workItems.map(item => <option key={item.id} value={item.id}>
              {item.ref} · {item.title}
            </option>)}
          </select>
        </div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="project-time-date">Work Date</label>
            <input id="project-time-date" type="date" className="input" required
              max={today()} value={spentOn}
              onChange={event => { setSpentOn(event.target.value); resetEntryRequest(); }}/></div>
          <div><label className="label" htmlFor="project-time-minutes">Minutes Worked</label>
            <input id="project-time-minutes" type="number" className="input" required min={1}
              max={1440} value={minutes}
              onChange={event => { setMinutes(event.target.value); resetEntryRequest(); }}/></div>
        </div>
        <div><label className="label" htmlFor="project-time-description">Work Description</label>
          <textarea id="project-time-description" className="input min-h-[85px] w-full" required
            maxLength={2000} value={description} rows={3}
            placeholder="Describe the completed work"
            onChange={event => { setDescription(event.target.value); resetEntryRequest(); }}/></div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={billable}
              onChange={event => { setBillable(event.target.checked); resetEntryRequest(); }}/>
            Billable Hours
          </label>
          <button type="submit" className="btn-primary inline-flex items-center gap-1"
            disabled={createEntry.isPending || !itemId || !description.trim()}>
            <Send size={13}/>{createEntry.isPending ? 'Saving…' : 'Log Time'}
          </button>
        </div>
      </form>
    </section>}

    <section className="panel">
      <div className="panel-header flex-wrap gap-2">
        <h3 className="panel-title">Time Entries</h3>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {entries.data?.count || 0} entries · {manager ? 'Project Team' : 'Your Time'}
        </span>
      </div>
      {entries.isLoading ? <ProjectLoading text="Loading time entries…"/> :
        entries.isError ? <div className="p-3"><ProjectError error={entries.error}/></div> :
        rows.length === 0 ? <p className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
          No time entries recorded yet.
        </p> :
        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {rows.map(row => <article key={row.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]"
              style={{ color: 'var(--text-3)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{row.staff_name}</span>
              <time dateTime={row.spent_on}>{row.spent_on}</time>
              {!compact && <Link className="hover:underline"
                href={`/projects/${project.id}/work-items/${row.work_item_id}`}>
                {row.work_item_ref}
              </Link>}
              <span>{minutesLabel(row.minutes)}</span>
              <span>{row.billable ? 'Billable' : 'Non Billable'}</span>
              <span className="font-medium" style={{
                color: row.review_state === 'approved' ? 'var(--accent-ok-fg)' : 'var(--text-3)',
              }}>{row.review_state === 'pending' ? 'Pending Review' : row.review_state === 'approved' ? 'Approved' : 'Rejected'}</span>
              {row.is_invoiced && <span className="font-semibold">Invoiced · {row.invoice_number}</span>}
            </div>
            <p className="whitespace-pre-wrap break-words text-xs"
              style={{ color: 'var(--text-1)' }}>{row.description}</p>
            {row.review_note && <p className="text-[11px]" style={{ color: 'var(--accent-warn-fg)' }}>
              Review: {row.review_note}
            </p>}
            {!row.is_invoiced && project.status !== 'archived' &&
              <div className="flex flex-wrap gap-2">
                {(manager || row.is_mine) && <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
                  onClick={() => startEdit(row)} disabled={updateEntry.isPending}>
                  <Pencil size={12}/> Edit
                </button>}
                {manager && <button type="button" className="btn-secondary text-xs"
                  disabled={reviewEntry.isPending} onClick={() => reviewEntry.mutate({
                    id: row.id, decision: 'approved',
                  })}><Check size={12}/> Approve</button>}
                {manager && <button type="button" className="btn-secondary text-xs"
                  disabled={reviewEntry.isPending} onClick={() => reviewEntry.mutate({
                    id: row.id, decision: 'rejected', note: 'Please revise this time entry.',
                  })}><X size={12}/> Reject</button>}
              </div>}
            {editing?.id === row.id && <form onSubmit={saveTimeEdit} className="space-y-2 border p-3"
              style={{ borderColor: 'var(--border-md)' }}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div><label className="label" htmlFor="time-edit-date">Work Date</label>
                  <input id="time-edit-date" className="input" type="date" required max={today()}
                    value={editDate} onChange={e => setEditDate(e.target.value)}/></div>
                <div><label className="label" htmlFor="time-edit-minutes">Minutes Worked</label>
                  <input id="time-edit-minutes" className="input" type="number" required min={1} max={1440}
                    value={editMinutes} onChange={e => setEditMinutes(e.target.value)}/></div>
              </div>
              <label className="label" htmlFor="time-edit-description">Description</label>
              <textarea id="time-edit-description" className="input min-h-[75px] w-full"
                required maxLength={2000} value={editDescription}
                onChange={e => setEditDescription(e.target.value)}/>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={editBillable}
                  onChange={e => setEditBillable(e.target.checked)}/> Billable Hours
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-xs" disabled={updateEntry.isPending}>
                  Save Time Entry
                </button>
                <button type="button" className="btn-secondary text-xs"
                  onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>}
          </article>)}
        </div>}
      {totalPages > 1 && <div className="flex items-center justify-between border-t p-3 text-xs"
        style={{ color: 'var(--text-3)', borderColor: 'var(--border-subtle)' }}>
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button className="icon-btn" aria-label="Previous time page"
            disabled={page <= 1} onClick={() => setPage(n => n - 1)}>
            <ChevronLeft size={14}/>
          </button>
          <button className="icon-btn" aria-label="Next time page"
            disabled={page >= totalPages} onClick={() => setPage(n => n + 1)}>
            <ChevronRight size={14}/>
          </button>
        </div>
      </div>}
    </section>

    {manager && !compact && <section className="panel">
      <div className="panel-header"><h3 className="panel-title inline-flex items-center gap-2">
        <FileText size={14}/> Project Billing
      </h3></div>
      <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-2">
        <form onSubmit={submitRate} className="space-y-3">
          <h4 className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            Project Hourly Rate
          </h4>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Set a Project specific rate. Existing Ticket Rates and invoices are unaffected.
          </p>
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1" aria-label="Project hourly rate" type="number"
              min="0.01" step="0.01" required value={rateValue}
              onChange={e => setRateValue(e.target.value)}/>
            <select className="select w-24" aria-label="Project billing currency"
              value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-secondary" disabled={updateRate.isPending}>
            {updateRate.isPending ? 'Saving…' : 'Save Rate'}
          </button>
        </form>
        <form onSubmit={submitInvoice} className="space-y-3">
          <h4 className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            Create Draft Invoice
          </h4>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Only approved, billable and unbilled entries in the selected period are included.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="project-invoice-from">From</label>
              <input id="project-invoice-from" type="date" className="input" required
                value={fromDate} onChange={e => { setFromDate(e.target.value); setInvoiceRequest(null); }}/></div>
            <div><label className="label" htmlFor="project-invoice-to">To</label>
              <input id="project-invoice-to" type="date" className="input" required
                value={toDate} onChange={e => { setToDate(e.target.value); setInvoiceRequest(null); }}/></div>
          </div>
          <div><label className="label" htmlFor="project-invoice-tax">Tax Rate (%)</label>
            <input id="project-invoice-tax" className="input" required type="number" min={0} max={100}
              step="0.01" value={taxRate} onChange={e => { setTaxRate(e.target.value); setInvoiceRequest(null); }}/></div>
          <button type="submit" className="btn-primary" disabled={createInvoice.isPending || !rate.data?.hourly_rate}>
            {createInvoice.isPending ? 'Creating…' : 'Create Draft Invoice'}
          </button>
          {invoiceCreated && <p role="status" className="text-xs" style={{ color: 'var(--accent-ok-fg)' }}>
            Created {invoiceCreated}
          </p>}
        </form>
      </div>
      <div className="border-t p-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <h4 className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          Project Invoices
        </h4>
        {invoices.isLoading ? <ProjectLoading text="Loading invoices…"/> :
          invoices.isError ? <ProjectError error={invoices.error}/> :
          !invoices.data?.length ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            No Project invoices yet.
          </p> : <div className="space-y-2">
            {invoices.data.map(invoice => <div key={invoice.invoice_id}
              className="flex flex-wrap items-center justify-between gap-2 border p-3 text-xs"
              style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="space-y-1">
                <div className="font-semibold" style={{ color: 'var(--text-1)' }}>{invoice.invoice_number}</div>
                <div style={{ color: 'var(--text-3)' }}>
                  {invoice.status} · {invoice.currency} {invoice.total} · {invoice.period_from} to {invoice.period_to}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/settings/billing/invoices" className="btn-secondary text-xs">Billing</Link>
                {invoice.status === 'draft' && <button type="button" className="btn-secondary text-xs"
                  disabled={voidInvoice.isPending}
                  onClick={() => void voidDraft(invoice.invoice_id, invoice.invoice_number)}>
                  Void Draft
                </button>}
              </div>
            </div>)}
          </div>}
      </div>
    </section>}
  </div>;
}
