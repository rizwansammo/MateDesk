'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, Clock3,
  FilePenLine, History, ListChecks, MessageSquareText, Plus, Send, X,
} from 'lucide-react';
import type { Project } from '@/types/projects';
import {
  type ScopeContent, type ScopeVersion, type ScopeChangeRequest,
  type NewScopeProposal, useProjectScope, useProposeProjectScope,
  useDecideProjectScope, useRequestProjectScopeChange,
  useReviewProjectScopeChange,
} from '@/hooks/useProjectScope';

type ScopeForm = {
  title: string;
  requirements: string;
  deliverables: string;
  acceptance: string;
  exclusions: string;
  budget: string;
  currency: string;
  targetDate: string;
  costImpact: string;
};

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BDT'];

function lines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function readableDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString() : 'Not specified';
}

function amount(value: string | null, currency: string): string {
  if (value == null) return 'Not specified';
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numeric)
    : `${currency} ${value}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'This action could not be completed.';
}

function statusLabel(value: string): string {
  const values: Record<string, string> = {
    submitted: 'Submitted',
    under_review: 'Under Review',
    awaiting_client: 'Awaiting Client',
    pending_client: 'Awaiting Client',
    changes_requested: 'Changes Requested',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return values[value] || value;
}

function StatusLabel({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-medium"
      style={{
        borderColor: 'var(--border-md)',
        color: value === 'approved' ? 'var(--accent-ok-fg)' :
          value === 'rejected' ? 'var(--accent-danger-fg)' : 'var(--text-2)',
      }}>
      {value === 'approved' ? <CheckCircle2 size={12}/> : <Clock3 size={12}/>}
      {statusLabel(value)}
    </span>
  );
}

function ScopeDetails({ scope, prior = false }: { scope: ScopeContent; prior?: boolean }) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Requirements</h4>
          <p className="whitespace-pre-wrap break-words text-xs leading-6"
            style={{ color: 'var(--text-2)' }}>{scope.requirements}</p>
        </div>
        <div className="min-w-0">
          <h4 className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Exclusions</h4>
          <p className="whitespace-pre-wrap break-words text-xs leading-6"
            style={{ color: 'var(--text-2)' }}>{scope.exclusions || 'None specified'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            <ListChecks size={13}/> Deliverables
          </h4>
          <ul className="space-y-1.5 pl-4 text-xs" style={{ color: 'var(--text-2)' }}>
            {scope.deliverables.map((item, index) => (
              <li key={index} className="list-disc break-words">{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            <ClipboardCheck size={13}/> Acceptance Criteria
          </h4>
          <ul className="space-y-1.5 pl-4 text-xs" style={{ color: 'var(--text-2)' }}>
            {scope.acceptance_criteria.map((item, index) => (
              <li key={index} className="list-disc break-words">{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-xs"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
        <span>Estimated budget: <strong style={{ color: 'var(--text-1)' }}>
          {amount(scope.budget_estimate, scope.budget_currency)}
        </strong></span>
        <span>Target date: <strong style={{ color: 'var(--text-1)' }}>{readableDate(scope.target_date)}</strong></span>
        {scope.cost_impact != null && (
          <span>Change estimate: <strong style={{ color: 'var(--text-1)' }}>
            {amount(scope.cost_impact, scope.budget_currency)}
          </strong></span>
        )}
      </div>
      {!prior && (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          These amounts are scope estimates, not invoices. Billing remains in Settings.
        </p>
      )}
    </div>
  );
}

function ApprovedScope({ current, versions }: { current: ScopeVersion | null; versions: ScopeVersion[] }) {
  if (!current) {
    return (
      <section className="panel w-full min-w-0 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardCheck size={16} style={{ color: 'var(--text-3)' }}/>
          <h2 className="text-sm font-semibold">Approved Scope</h2>
        </div>
        <p className="text-xs leading-6" style={{ color: 'var(--text-2)' }}>
          No client approved scope yet. A Project Manager can prepare the initial proposal,
          and an authorized Client Reviewer must approve it before the baseline is established.
          Existing Project Requirements remain unchanged.
        </p>
      </section>
    );
  }
  return (
    <section className="panel w-full min-w-0 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BadgeCheck size={17} style={{ color: 'var(--accent-ok-fg)' }}/>
          <div>
            <h2 className="text-sm font-semibold">{current.title}</h2>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Approved Scope Version {current.number} · Approved by {current.approved_by || 'Client'}
              {' · '}{readableDate(current.approved_at)}
            </p>
          </div>
        </div>
        <StatusLabel value="approved"/>
      </div>
      <ScopeDetails scope={current}/>
      {versions.length > 1 && (
        <details className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <summary className="cursor-pointer text-xs font-medium">
            <span className="inline-flex items-center gap-1.5"><History size={13}/> Previous Approved Versions ({versions.length - 1})</span>
          </summary>
          <div className="mt-3 space-y-3">
            {versions.slice(1).map(version => (
              <details key={version.id} className="border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <summary className="cursor-pointer text-xs font-semibold">
                  Version {version.number}: {version.title} · {readableDate(version.approved_at)}
                </summary>
                <div className="mt-3">
                  <ScopeDetails scope={version} prior/>
                </div>
              </details>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function makeForm(scope: ScopeVersion | null, project: Project): ScopeForm {
  return {
    title: scope?.title || `${project.name} Scope`,
    requirements: scope?.requirements || project.description || '',
    deliverables: scope?.deliverables.join('\n') || '',
    acceptance: scope?.acceptance_criteria.join('\n') || '',
    exclusions: scope?.exclusions || '',
    budget: scope?.budget_estimate || '',
    currency: scope?.budget_currency || 'USD',
    targetDate: scope?.target_date || project.due_date || '',
    costImpact: '',
  };
}

export function ProjectScopePanel({ project }: { project: Project }) {
  const scope = useProjectScope(project.id);
  const propose = useProposeProjectScope(project.id);
  const decide = useDecideProjectScope(project.id);
  const requestChange = useRequestProjectScopeChange(project.id);
  const review = useReviewProjectScopeChange(project.id);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showProposal, setShowProposal] = useState(false);
  const [proposalChangeId, setProposalChangeId] = useState('');
  const [form, setForm] = useState<ScopeForm>(() => makeForm(null, project));
  const [clientFeedback, setClientFeedback] = useState('');
  const [changeTitle, setChangeTitle] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [requestedChanges, setRequestedChanges] = useState('');
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const overview = scope.data;
  const locked = project.status === 'completed' || project.status === 'archived';
  const pending = overview?.pending_proposal;
  const eligible = overview?.change_requests.filter(row =>
    row.status === 'under_review' || row.status === 'changes_requested',
  ) || [];

  function startProposal(changeId = '') {
    setError('');
    setNotice('');
    setProposalChangeId(changeId);
    setForm(makeForm(overview?.current_version || null, project));
    setShowProposal(true);
  }

  function setField<K extends keyof ScopeForm>(key: K, value: ScopeForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const payload: NewScopeProposal = {
      title: form.title.trim(),
      requirements: form.requirements.trim(),
      deliverables: lines(form.deliverables),
      acceptance_criteria: lines(form.acceptance),
      exclusions: form.exclusions.trim(),
      budget_estimate: form.budget.trim() || null,
      budget_currency: form.currency,
      target_date: form.targetDate || null,
      cost_impact: overview?.current_version ? (form.costImpact.trim() || '0.00') : null,
      ...(proposalChangeId ? { change_request_id: proposalChangeId } : {}),
    };
    if (!payload.deliverables.length || !payload.acceptance_criteria.length) {
      setError('Add at least one deliverable and one acceptance criterion.');
      return;
    }
    try {
      await propose.mutateAsync(payload);
      setShowProposal(false);
      setNotice('Scope proposal sent to the Client for approval.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function decideProposal(decision: 'approved' | 'changes_requested' | 'rejected') {
    if (!pending) return;
    if (decision !== 'approved' && !clientFeedback.trim()) {
      setError('Explain what must change or why the proposal is rejected.');
      return;
    }
    if (decision === 'approved' && !window.confirm(
      'Approve this Scope? The approved requirements and acceptance criteria will become the new agreed baseline.',
    )) return;
    setError('');
    setNotice('');
    try {
      await decide.mutateAsync({
        proposalId: pending.id, decision, feedback: clientFeedback.trim(),
      });
      setClientFeedback('');
      setNotice(decision === 'approved'
        ? 'The agreed Scope Version has been approved.'
        : 'Your Scope decision and feedback were recorded.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await requestChange.mutateAsync({
        title: changeTitle.trim(), requested_changes: requestedChanges.trim(),
        reason: changeReason.trim(),
      });
      setChangeTitle('');
      setRequestedChanges('');
      setChangeReason('');
      setShowChangeForm(false);
      setNotice('Scope Change Request submitted to the Project Manager.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function reviewChange(
    change: ScopeChangeRequest, decision: 'under_review' | 'rejected',
  ) {
    const note = (reviewNotes[change.id] || '').trim();
    if (decision === 'rejected' && !note) {
      setError('Provide an explanation before rejecting a Scope Change Request.');
      return;
    }
    setError('');
    setNotice('');
    try {
      await review.mutateAsync({
        changeId: change.id, decision, review_note: note,
      });
      setNotice(decision === 'under_review'
        ? 'Change Request marked Under Review. Prepare the revised Scope when ready.'
        : 'Change Request rejected and recorded in the history.');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (scope.isLoading) {
    return <div className="panel w-full p-5 text-xs" style={{ color: 'var(--text-3)' }}>
      Loading Scope and Change Requests…
    </div>;
  }
  if (scope.isError || !overview) {
    return <div className="panel w-full p-5 text-xs" role="alert">
      {errorMessage(scope.error)}
      <button className="btn-secondary ml-3" onClick={() => { void scope.refetch(); }}>Retry</button>
    </div>;
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Project Scope & Changes</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Formal requirements, client acceptance and a permanent change history.
          </p>
        </div>
        {overview.can_manage && !pending && !showProposal && !locked && (
          !overview.current_version || eligible.length > 0
        ) && (
          <button type="button" className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => startProposal(eligible.length === 1 ? eligible[0].id : '')}>
            <Plus size={13}/> {overview.current_version ? 'Prepare Revised Scope' : 'Prepare Initial Scope'}
          </button>
        )}
      </div>

      {error && <div className="panel p-3 text-xs" role="alert"
        style={{ color: 'var(--accent-danger-fg)' }}>{error}</div>}
      {notice && <div className="panel p-3 text-xs" role="status"
        style={{ color: 'var(--accent-ok-fg)' }}>{notice}</div>}
      {locked && (
        <div className="panel p-3 text-xs" style={{ color: 'var(--text-2)' }}>
          This Project is {project.status}. A Manager must Reopen it before changing Scope.
        </div>
      )}

      <ApprovedScope current={overview.current_version} versions={overview.versions}/>

      {pending && (
        <section className="panel w-full min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText size={16} style={{ color: 'var(--text-3)' }}/>
              <div>
                <h3 className="text-sm font-semibold">Proposed Scope: {pending.title}</h3>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Sent by {pending.proposed_by || 'Project Manager'} · {readableDate(pending.proposed_at)}
                </p>
              </div>
            </div>
            <StatusLabel value={pending.status}/>
          </div>
          <ScopeDetails scope={pending}/>
          {overview.can_review && !locked ? (
            <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <label className="label" htmlFor="scope-client-feedback">Feedback (required for rejection or changes)</label>
              <textarea id="scope-client-feedback" className="input min-h-[80px] w-full"
                rows={3} value={clientFeedback} maxLength={5000}
                placeholder="Explain requested revisions or your approval notes"
                onChange={event => setClientFeedback(event.target.value)}/>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary inline-flex items-center gap-1.5"
                  disabled={decide.isPending} onClick={() => { void decideProposal('approved'); }}>
                  <CheckCircle2 size={14}/> Approve Scope
                </button>
                <button type="button" className="btn-secondary"
                  disabled={decide.isPending} onClick={() => { void decideProposal('changes_requested'); }}>
                  Request Changes
                </button>
                <button type="button" className="btn-secondary"
                  disabled={decide.isPending} onClick={() => { void decideProposal('rejected'); }}>
                  Reject Proposal
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}>
              Awaiting an authorized Client Reviewer decision. The current approved Scope remains unchanged.
            </p>
          )}
        </section>
      )}

      {showProposal && overview.can_manage && !pending && !locked && (
        <section className="panel w-full min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {overview.current_version ? 'Prepare Scope Revision' : 'Prepare Initial Scope'}
            </h3>
            <button type="button" aria-label="Close Scope form"
              onClick={() => setShowProposal(false)}><X size={17}/></button>
          </div>
          <form className="space-y-3" onSubmit={submitProposal}>
            {overview.current_version && (
              <div>
                <label className="label" htmlFor="scope-change-ref">Change Request</label>
                <select id="scope-change-ref" className="select w-full" required
                  value={proposalChangeId} onChange={event => setProposalChangeId(event.target.value)}>
                  <option value="">Choose Reviewed Change Request</option>
                  {eligible.map(row => (
                    <option value={row.id} key={row.id}>{row.title} ({statusLabel(row.status)})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label" htmlFor="scope-title">Scope Title</label>
                <input id="scope-title" className="input w-full" required minLength={5} maxLength={200}
                  value={form.title} onChange={event => setField('title', event.target.value)}/>
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="scope-requirements">Requirements</label>
                <textarea id="scope-requirements" className="input w-full" rows={4}
                  required minLength={15} maxLength={20000} value={form.requirements}
                  onChange={event => setField('requirements', event.target.value)}
                  placeholder="Describe the agreed requirements"/>
              </div>
              <div>
                <label className="label" htmlFor="scope-deliverables">Deliverables (one per line)</label>
                <textarea id="scope-deliverables" className="input w-full" rows={4} required
                  value={form.deliverables} onChange={event => setField('deliverables', event.target.value)}
                  placeholder="Website pages&#10;Deployment documentation"/>
              </div>
              <div>
                <label className="label" htmlFor="scope-criteria">Acceptance Criteria (one per line)</label>
                <textarea id="scope-criteria" className="input w-full" rows={4} required
                  value={form.acceptance} onChange={event => setField('acceptance', event.target.value)}
                  placeholder="Client validates the final deliverables"/>
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="scope-exclusions">Exclusions (optional)</label>
                <textarea id="scope-exclusions" className="input w-full" rows={2}
                  value={form.exclusions} maxLength={10000}
                  onChange={event => setField('exclusions', event.target.value)}/>
              </div>
              <div>
                <label className="label" htmlFor="scope-estimate">Estimated Budget</label>
                <input id="scope-estimate" type="number" min="0" step="0.01"
                  className="input w-full" value={form.budget}
                  onChange={event => setField('budget', event.target.value)}/>
              </div>
              <div>
                <label className="label" htmlFor="scope-currency">Currency</label>
                <select id="scope-currency" className="select w-full" value={form.currency}
                  onChange={event => setField('currency', event.target.value)}>
                  {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="scope-target-date">Target Date (optional)</label>
                <input id="scope-target-date" type="date" className="input w-full" value={form.targetDate}
                  onChange={event => setField('targetDate', event.target.value)}/>
              </div>
              {overview.current_version && (
                <div>
                  <label className="label" htmlFor="scope-cost-impact">Estimated Cost Impact</label>
                  <input id="scope-cost-impact" type="number" step="0.01"
                    className="input w-full" value={form.costImpact}
                    placeholder="0.00 if no cost change"
                    onChange={event => setField('costImpact', event.target.value)}/>
                </div>
              )}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              Estimates do not generate invoices or modify Billing Settings. Every approved Scope Version
              is preserved and never replaces existing Work Items automatically.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={propose.isPending}
                className="btn-primary inline-flex items-center gap-1.5">
                <Send size={14}/> {propose.isPending ? 'Submitting…' : 'Send to Client for Approval'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowProposal(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel w-full min-w-0 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Scope Change Requests</h3>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Requests need Manager Review and explicit Client Approval before changing the agreed Scope.
            </p>
          </div>
          {overview.current_version && overview.can_request_change && !locked && (
            <button type="button" className="btn-secondary inline-flex items-center gap-1"
              onClick={() => setShowChangeForm(current => !current)}>
              {showChangeForm ? <X size={13}/> : <Plus size={13}/>}
              {showChangeForm ? 'Cancel' : 'Request Scope Change'}
            </button>
          )}
        </div>

        {showChangeForm && overview.current_version && !locked && (
          <form onSubmit={submitChange} className="mb-4 space-y-3 border p-3"
            style={{ borderColor: 'var(--border-subtle)' }}>
            <div>
              <label className="label" htmlFor="change-title">Change Title</label>
              <input id="change-title" className="input w-full" required minLength={5} maxLength={200}
                value={changeTitle} onChange={event => setChangeTitle(event.target.value)}
                placeholder="Add a customer portal"/>
            </div>
            <div>
              <label className="label" htmlFor="change-description">Requested Changes</label>
              <textarea id="change-description" className="input w-full" rows={3}
                required minLength={15} maxLength={12000} value={requestedChanges}
                onChange={event => setRequestedChanges(event.target.value)}
                placeholder="Describe what needs to change in the approved Scope"/>
            </div>
            <div>
              <label className="label" htmlFor="change-reason">Business Reason (optional)</label>
              <textarea id="change-reason" className="input w-full" rows={2}
                maxLength={5000} value={changeReason}
                onChange={event => setChangeReason(event.target.value)}/>
            </div>
            <button type="submit" className="btn-primary inline-flex items-center gap-1.5"
              disabled={requestChange.isPending}>
              <Send size={13}/> {requestChange.isPending ? 'Submitting…' : 'Submit Change Request'}
            </button>
          </form>
        )}

        {overview.change_requests.length === 0 ? (
          <p className="py-4 text-xs" style={{ color: 'var(--text-3)' }}>
            No Scope Change Requests yet. Approved Scope is unchanged.
          </p>
        ) : (
          <div className="space-y-3">
            {overview.change_requests.map(change => {
              const canReviewNow = overview.can_manage && !locked &&
                ['submitted', 'under_review', 'changes_requested'].includes(change.status);
              const canPrepare = overview.can_manage && !locked && !pending &&
                ['under_review', 'changes_requested'].includes(change.status);
              return (
                <article key={change.id} className="min-w-0 border p-3"
                  style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold">{change.title}</h4>
                      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        Submitted by {change.requested_by || 'Project Member'} · {readableDate(change.created_at)}
                      </p>
                    </div>
                    <StatusLabel value={change.status}/>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6"
                    style={{ color: 'var(--text-2)' }}>{change.requested_changes}</p>
                  {change.reason && (
                    <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                      Reason: {change.reason}
                    </p>
                  )}
                  {change.review_note && (
                    <p className="mt-2 text-xs" style={{ color: 'var(--text-2)' }}>
                      Manager Review: {change.review_note}
                    </p>
                  )}
                  {canReviewNow && (
                    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                      <label className="label" htmlFor={`review-note-${change.id}`}>
                        Manager Review Note (required for rejection)
                      </label>
                      <textarea id={`review-note-${change.id}`}
                        className="input w-full" rows={2} maxLength={5000}
                        value={reviewNotes[change.id] || ''}
                        onChange={event => setReviewNotes(current => ({
                          ...current, [change.id]: event.target.value,
                        }))}/>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {change.status !== 'under_review' && (
                          <button type="button" className="btn-secondary" disabled={review.isPending}
                            onClick={() => { void reviewChange(change, 'under_review'); }}>
                            Start Review
                          </button>
                        )}
                        {canPrepare && (
                          <button type="button" className="btn-primary inline-flex items-center gap-1"
                            onClick={() => startProposal(change.id)}>
                            <FilePenLine size={13}/> Prepare Revised Scope <ArrowRight size={12}/>
                          </button>
                        )}
                        <button type="button" className="btn-secondary" disabled={review.isPending}
                          onClick={() => { void reviewChange(change, 'rejected'); }}>
                          Reject Request
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {overview.proposals.some(proposal => proposal.status !== 'pending_client') && (
        <section className="panel w-full min-w-0 p-4">
          <div className="mb-3 flex items-center gap-2">
            <History size={15} style={{ color: 'var(--text-3)' }}/>
            <h3 className="text-sm font-semibold">Proposal Decisions</h3>
          </div>
          <div className="space-y-2">
            {overview.proposals.filter(proposal => proposal.status !== 'pending_client').map(proposal => (
              <div key={proposal.id} className="flex flex-wrap items-start justify-between gap-3 border-b py-2"
                style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{proposal.title}</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    Decided by {proposal.decided_by || 'Client'} · {readableDate(proposal.decided_at)}
                  </p>
                  {proposal.client_feedback && (
                    <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: 'var(--text-2)' }}>
                      {proposal.client_feedback}
                    </p>
                  )}
                </div>
                <StatusLabel value={proposal.status}/>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
