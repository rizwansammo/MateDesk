'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ClipboardList, ExternalLink, FolderKanban, MessageSquare, UserRoundPlus } from 'lucide-react';
import {
  useClaimProjectRequest, useConvertProjectRequest, useProjectRequest, useReviewProjectRequest,
} from '@/hooks/useProjectRequests';
import { useAuthStore } from '@/store/useAuthStore';
import { ProjectError, ProjectLoading, StatePill } from '@/components/projects/ProjectUI';

const REVIEW_STATUSES: { value: 'under_review' | 'awaiting_details' | 'approved' | 'rejected'; label: string }[] = [
  { value: 'under_review', label: 'Under Review' },
  { value: 'awaiting_details', label: 'Awaiting Details' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-1)' }}>{value || 'Not provided'}</div>
    </div>
  );
}

export default function ProjectRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const isStaff = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');
  const { data: row, isLoading, error, refetch } = useProjectRequest(id);
  const claim = useClaimProjectRequest(id);
  const review = useReviewProjectRequest(id);
  const convert = useConvertProjectRequest(id);
  const [reviewStatus, setReviewStatus] = useState<'under_review' | 'awaiting_details' | 'approved' | 'rejected'>('under_review');
  const [note, setNote] = useState('');
  const [key, setKey] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDue, setProjectDue] = useState('');

  useEffect(() => {
    if (!row) return;
    setProjectName(row.name);
    setProjectDue(row.expected_date || '');
    if (row.status === 'under_review' || row.status === 'awaiting_details' ||
        row.status === 'approved' || row.status === 'rejected') {
      setReviewStatus(row.status);
    }
  }, [row?.id, row?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await review.mutateAsync({ status: reviewStatus, note });
      setNote('');
    } catch { /* Mutation error appears in the review panel. */ }
  }

  async function submitConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await convert.mutateAsync({
        key: key.toUpperCase(), name: projectName.trim(),
        ...(projectDue ? { due_date: projectDue } : {}),
      });
      if (result.converted_project_id) router.push('/projects/' + result.converted_project_id);
    } catch { /* Mutation error appears in the convert panel. */ }
  }

  if (isLoading) return <ProjectLoading text="Opening project request…"/>;
  if (!row || error) return (
    <div className="p-4"><ProjectError error={error || new Error('Project Request unavailable')}
      retry={() => { void refetch(); }}/></div>
  );

  const finalized = row.status === 'converted' || row.status === 'rejected';
  const mayClaim = isStaff && !finalized && !row.assigned_agent_id;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5" style={{ background: 'var(--bg-base)' }}>
      <div className="mx-auto max-w-[1180px] space-y-4">
        <Link href="/requests" className="inline-flex items-center gap-2 text-xs"
          style={{ color: 'var(--text-3)' }}><ArrowLeft size={14}/> Requests</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent-info-fg)' }}>
              <ClipboardList size={16}/> Project Request · {row.ticket_ref}
            </div>
            <h1 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-0)' }}>{row.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatePill value={row.status}/>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{row.client_org}</span>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Submitted by {row.requested_by || 'Client'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={'/requests/' + row.ticket_ref} className="btn-secondary inline-flex items-center gap-2 text-xs">
              <MessageSquare size={14}/> Open Conversation <ExternalLink size={12}/>
            </Link>
            {row.converted_project_id && <Link className="btn-primary inline-flex items-center gap-2 text-xs"
              href={'/projects/' + row.converted_project_id}><FolderKanban size={14}/> Open Project</Link>}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="panel space-y-4 p-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Request Details</h2>
            <div className="grid grid-cols-1 gap-4 border-b pb-4 sm:grid-cols-2"
              style={{ borderColor: 'var(--border-subtle)' }}>
              <Field label="Project Type" value={row.kind.replaceAll('_', ' ')}/>
              <Field label="Estimated Budget" value={row.budget ? row.budget_currency + ' ' + row.budget : null}/>
              <Field label="Preferred Deadline" value={row.expected_date}/>
              <Field label="Assigned Agent" value={row.assigned_agent}/>
            </div>
            <Field label="Description" value={row.description}/>
            <Field label="Requirements" value={row.requirements}/>
            <div className="border-t pt-3 text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
              The original Support Ticket contains the complete conversation and attachments.
              <Link className="ml-2 underline" href={'/requests/' + row.ticket_ref}>View Ticket</Link>
            </div>
          </section>

          <div className="space-y-3">
            {mayClaim && <section className="panel space-y-2 p-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Take Ownership</h2>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Claim this Project Request to discuss requirements and review it.
              </p>
              {claim.error && <p role="alert" className="text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
                {claim.error.message}</p>}
              <button type="button" className="btn-primary gap-2" disabled={claim.isPending}
                onClick={() => { claim.mutate(); }}>
                <UserRoundPlus size={14}/> {claim.isPending ? 'Assigning…' : 'Assign to Me'}
              </button>
            </section>}
            {isStaff && !finalized && row.can_review && (
              <section className="panel space-y-3 p-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Review Request</h2>
                <form onSubmit={submitReview} className="space-y-3">
                  <div>
                    <label className="label" htmlFor="request-review-status">Review Decision</label>
                    <select className="select w-full" id="request-review-status"
                      value={reviewStatus} onChange={event => setReviewStatus(event.target.value as typeof reviewStatus)}>
                      {REVIEW_STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="request-review-note">Message to Client</label>
                    <textarea id="request-review-note" className="input min-h-[90px] w-full"
                      value={note} onChange={event => setNote(event.target.value)}
                      placeholder="Questions, review decision or required changes."
                      maxLength={5000} required={reviewStatus === 'rejected'}/>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                      The note is saved to the original Support Ticket conversation.
                    </p>
                  </div>
                  {review.error && <p role="alert" className="text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
                    {review.error.message}</p>}
                  <button type="submit" className="btn-primary" disabled={review.isPending}>
                    {review.isPending ? 'Saving…' : 'Save Review'}
                  </button>
                </form>
              </section>
            )}
            {isStaff && row.status === 'approved' && (
              <section className="panel space-y-3 p-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Convert to Project</h2>
                {row.can_convert ? (
                  <form onSubmit={submitConversion} className="space-y-3">
                    <div>
                      <label className="label" htmlFor="convert-key">Project Key *</label>
                      <input id="convert-key" className="input w-full font-mono uppercase" required
                        minLength={2} maxLength={12} pattern="[A-Z0-9]{2,12}" placeholder="WEBSITE"
                        value={key} onChange={event => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/>
                    </div>
                    <div>
                      <label className="label" htmlFor="convert-name">Project Name</label>
                      <input id="convert-name" className="input w-full" required maxLength={200}
                        value={projectName} onChange={event => setProjectName(event.target.value)}/>
                    </div>
                    <div>
                      <label className="label" htmlFor="convert-date">Target Date</label>
                      <input id="convert-date" type="date" className="input w-full"
                        value={projectDue} onChange={event => setProjectDue(event.target.value)}/>
                    </div>
                    {convert.error && <p role="alert" className="text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
                      {convert.error.message}</p>}
                    <button type="submit" className="btn-primary gap-2" disabled={convert.isPending}>
                      <FolderKanban size={14}/>{convert.isPending ? 'Creating…' : 'Create Project'}
                    </button>
                  </form>
                ) : <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  An MSP Manager must grant Project Creation Access to this Agent first.
                </p>}
              </section>
            )}
            {row.status === 'converted' && <section className="panel flex items-start gap-2 p-4">
              <CheckCircle2 size={18} style={{ color: 'var(--accent-ok-fg)' }}/>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>Project Created</h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                  This Request is now managed as a Project. The original discussion remains available.
                </p>
              </div>
            </section>}
          </div>
        </div>
      </div>
    </div>
  );
}
