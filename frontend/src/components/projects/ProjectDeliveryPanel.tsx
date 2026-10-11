'use client';

import { FormEvent, useState } from 'react';
import {
  Archive, CheckCircle2, ClipboardCheck, ExternalLink, RotateCcw, Send, ShieldCheck,
} from 'lucide-react';
import type { Project } from '@/types/projects';
import {
  useProjectDelivery, useSubmitProjectDelivery,
  useDecideProjectDelivery, useDeliveryAction,
} from '@/hooks/useProjectDelivery';
import { ProjectError, ProjectLoading, StatePill } from './ProjectUI';

export function ProjectDeliveryPanel({ project }: { project: Project }) {
  const { data, isLoading, error, refetch } = useProjectDelivery(project.id);
  const submit = useSubmitProjectDelivery(project.id);
  const decide = useDecideProjectDelivery(project.id);
  const lifecycle = useDeliveryAction(project.id);
  const [summary, setSummary] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [feedback, setFeedback] = useState('');
  const [localError, setLocalError] = useState('');
  const latest = data?.latest;
  const active = project.status === 'active';
  const submitted = latest?.status === 'pending';
  const approved = latest?.status === 'approved';
  const canSubmit = Boolean(
    data?.can_submit && active && data?.readiness?.ready && !submitted
    && (!approved || data?.review_requires_resubmission)
  );
  const canReview = Boolean(data?.can_review && submitted && active);
  const canFinalize = Boolean(data?.can_submit && active && approved
    && !data?.review_requires_resubmission && data?.readiness?.ready);

  async function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    if (summary.trim().length < 15) {
      setLocalError('Provide at least 15 characters describing the delivered work.');
      return;
    }
    try {
      await submit.mutateAsync({
        summary: summary.trim(),
        ...(deliveryUrl.trim() ? { delivery_url: deliveryUrl.trim() } : {}),
      });
      setSummary('');
      setDeliveryUrl('');
    } catch { /* Server validation is shown below. */ }
  }

  async function decideDelivery(decision: 'approved' | 'changes_requested') {
    setLocalError('');
    if (decision === 'changes_requested' && !feedback.trim()) {
      setLocalError('Explain which changes are required.');
      return;
    }
    try {
      await decide.mutateAsync({
        decision,
        feedback: feedback.trim(),
      });
      setFeedback('');
    } catch { /* Server validation is shown below. */ }
  }

  async function runAction(action: 'complete' | 'archive' | 'reopen') {
    const prompts = {
      complete: 'Mark this Project Completed after Client Approval?',
      archive: 'Archive this completed Project? You can reopen it later.',
      reopen: 'Reopen this Project? Fresh Client Approval will be required before another completion.',
    };
    if (!window.confirm(prompts[action])) return;
    try {
      await lifecycle.mutateAsync(action);
    } catch { /* Server validation is shown below. */ }
  }

  if (isLoading) return <ProjectLoading text="Loading Project Delivery…"/>;
  if (error || !data) return <div className="p-3"><ProjectError error={error}
    retry={() => { void refetch(); }}/></div>;

  return (
    <div className="mx-auto max-w-[1100px] space-y-3">
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: 'var(--text-0)' }}>
              <ShieldCheck size={17} style={{ color: 'var(--accent-info-fg)' }}/>
              Project Delivery & Approval
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
              Work completion, Client Review, final acceptance and Project Closure.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatePill value={project.status}/>
            {latest && <StatePill value={latest.status}/>}
          </div>
        </div>
        {data.readiness && (
          <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ['Completed Work', data.readiness.done],
                ['Remaining Work', data.readiness.unfinished],
                ['Open Milestones', data.readiness.incomplete_milestones],
                ['Open Support', data.readiness.open_support_tickets],
              ] as const).map(([label, number]) => (
                <div key={label} className="border p-3"
                  style={{ borderColor: 'var(--border-md)', background: 'var(--bg-card)' }}>
                  <div className="text-xl font-semibold" style={{ color: 'var(--text-0)' }}>{number}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</div>
                </div>
              ))}
            </div>
            {!data.readiness.ready && data.can_submit && project.status !== 'completed'
              && project.status !== 'archived' && (
              <div role="status" className="space-y-2 border p-3"
                style={{ borderColor: 'var(--accent-warn-border)', background: 'var(--accent-warn-bg)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--accent-warn-fg)' }}>
                  Before submitting delivery:
                </div>
                {data.readiness.blockers.map(item => (
                  <p key={item} className="text-xs" style={{ color: 'var(--text-2)' }}>• {item}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {data.project_status === 'completed' && (
          <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--accent-ok-fg)' }}>
            <CheckCircle2 size={15}/> Client Approved and Project Completed.
          </div>
        )}
        {data.project_status === 'archived' && (
          <div className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}>
            This Project is archived. Delivery history is retained.
          </div>
        )}
      </section>

      {latest && (
        <section className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
              Delivery Round {latest.round_number}
            </h2>
            <StatePill value={latest.status}/>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-xs leading-6"
            style={{ color: 'var(--text-2)' }}>{latest.summary}</p>
          {latest.delivery_url && (
            <a href={latest.delivery_url} target="_blank" rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--accent-info-fg)' }}>
              Open Delivered Work <ExternalLink size={13}/>
            </a>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]"
            style={{ color: 'var(--text-3)' }}>
            <span>Submitted by {latest.submitted_by || 'MSP Team'}</span>
            <span>{new Date(latest.submitted_at).toLocaleString()}</span>
            {latest.reviewed_by && <span>Reviewed by {latest.reviewed_by}</span>}
          </div>
          {latest.feedback && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Client Feedback</div>
              <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: 'var(--text-2)' }}>
                {latest.feedback}
              </p>
            </div>
          )}
        </section>
      )}

      {data.review_requires_resubmission && data.can_submit && (
        <div className="panel p-3 text-xs" role="status"
          style={{ color: 'var(--accent-warn-fg)' }}>
          This Project changed after Client Approval or was reopened. Submit a new delivery round.
        </div>
      )}

      {canSubmit && (
        <section className="panel p-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
            {latest?.status === 'changes_requested' ? 'Submit Updated Delivery' : 'Submit for Client Review'}
          </h2>
          <p className="my-2 text-xs" style={{ color: 'var(--text-3)' }}>
            Include what was delivered and an optional demo or release URL. Your Client Reviewer will see it here.
          </p>
          <form onSubmit={submitDelivery} className="space-y-3">
            <div>
              <label htmlFor="delivery-summary" className="label">Delivery Summary *</label>
              <textarea id="delivery-summary" className="input min-h-[110px] w-full resize-y"
                value={summary} maxLength={10000} required
                onChange={event => setSummary(event.target.value)}
                placeholder="Describe delivered features, testing and handover details."/>
            </div>
            <div>
              <label htmlFor="delivery-url" className="label">Demo / Delivery URL (optional)</label>
              <input id="delivery-url" type="url" className="input w-full"
                maxLength={2000} placeholder="https://example.com"
                value={deliveryUrl} onChange={event => setDeliveryUrl(event.target.value)}/>
            </div>
            <button type="submit" disabled={submit.isPending} className="btn-primary gap-2">
              <Send size={14}/>{submit.isPending ? 'Submitting…' : 'Submit for Client Review'}
            </button>
          </form>
        </section>
      )}

      {canReview && (
        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
            Client Delivery Decision
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Review the delivered work before approval. You can approve or request changes.
          </p>
          <div>
            <label htmlFor="delivery-feedback" className="label">Feedback (required for changes)</label>
            <textarea id="delivery-feedback" className="input min-h-[100px] w-full"
              value={feedback} maxLength={5000}
              onChange={event => setFeedback(event.target.value)}
              placeholder="Describe anything you would like the team to change."/>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary gap-2" disabled={decide.isPending}
              onClick={() => { void decideDelivery('approved'); }}>
              <CheckCircle2 size={14}/> Approve Delivery
            </button>
            <button type="button" className="btn-secondary gap-2" disabled={decide.isPending}
              onClick={() => { void decideDelivery('changes_requested'); }}>
              <RotateCcw size={14}/> Request Changes
            </button>
          </div>
        </section>
      )}

      {data.can_submit && (canFinalize || project.status === 'completed'
        || project.status === 'archived') && (
        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Project Closure</h2>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Client Approval and administrative Project Completion are separate steps.
          </p>
          <div className="flex flex-wrap gap-2">
            {canFinalize && <button type="button" className="btn-primary gap-2"
              onClick={() => { void runAction('complete'); }} disabled={lifecycle.isPending}>
              <ClipboardCheck size={14}/> Mark Project Completed
            </button>}
            {project.status === 'completed' && <button type="button" className="btn-secondary gap-2"
              onClick={() => { void runAction('archive'); }} disabled={lifecycle.isPending}>
              <Archive size={14}/> Archive Project
            </button>}
            {(project.status === 'completed' || project.status === 'archived') &&
              <button type="button" className="btn-secondary gap-2" disabled={lifecycle.isPending}
                onClick={() => { void runAction('reopen'); }}>
                <RotateCcw size={14}/> Reopen Project
              </button>}
          </div>
        </section>
      )}

      {(localError || submit.error || decide.error || lifecycle.error) &&
        <div role="alert" className="border p-3 text-xs"
          style={{ borderColor: 'var(--accent-danger-fg)', color: 'var(--accent-danger-fg)' }}>
          {localError || submit.error?.message || decide.error?.message || lifecycle.error?.message}
        </div>}

      {data.history.length > 1 && (
        <section className="panel p-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Previous Delivery Rounds</h2>
          <div className="mt-3 divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {data.history.slice(1).map(item => (
              <div key={item.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                    Round {item.round_number}
                  </span>
                  <StatePill value={item.status}/>
                </div>
                <p className="whitespace-pre-wrap text-xs" style={{ color: 'var(--text-2)' }}>{item.summary}</p>
                {item.feedback && <p className="whitespace-pre-wrap text-xs"
                  style={{ color: 'var(--text-3)' }}>Client: {item.feedback}</p>}
              </div>
            ))}
          </div>
          {data.has_more && <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
            The most recent 20 delivery rounds are shown.
          </p>}
        </section>
      )}
    </div>
  );
}
