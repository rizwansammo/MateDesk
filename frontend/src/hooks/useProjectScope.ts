import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type ScopeChangeStatus =
  | 'submitted' | 'under_review' | 'awaiting_client'
  | 'changes_requested' | 'approved' | 'rejected';
export type ScopeProposalStatus =
  'pending_client' | 'changes_requested' | 'approved' | 'rejected';

export interface ScopeContent {
  id: string;
  title: string;
  requirements: string;
  deliverables: string[];
  acceptance_criteria: string[];
  exclusions: string;
  budget_estimate: string | null;
  budget_currency: string;
  target_date: string | null;
  cost_impact: string | null;
}
export interface ScopeVersion extends ScopeContent {
  number: number;
  proposal_id: string;
  change_request_id: string | null;
  approved_by: string | null;
  approved_at: string;
}
export interface ScopeProposal extends ScopeContent {
  status: ScopeProposalStatus;
  change_request_id: string | null;
  proposed_by: string | null;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  client_feedback: string;
}
export interface ScopeChangeRequest {
  id: string;
  title: string;
  requested_changes: string;
  reason: string;
  status: ScopeChangeStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  review_note: string;
  created_at: string;
  updated_at: string;
}
export interface ScopeOverview {
  current_version: ScopeVersion | null;
  versions: ScopeVersion[];
  pending_proposal: ScopeProposal | null;
  proposals: ScopeProposal[];
  change_requests: ScopeChangeRequest[];
  can_manage: boolean;
  can_review: boolean;
  can_request_change: boolean;
}
export interface NewScopeProposal {
  title: string;
  requirements: string;
  deliverables: string[];
  acceptance_criteria: string[];
  exclusions: string;
  budget_estimate: string | null;
  budget_currency: string;
  target_date: string | null;
  cost_impact: string | null;
  change_request_id?: string;
}
export interface NewScopeChange {
  title: string;
  requested_changes: string;
  reason: string;
}
const prefix = (projectId: string) => `/api/projects/${projectId}/scope/`;
const key = (projectId: string) => ['projects', projectId, 'scope'] as const;

export function useProjectScope(projectId: string) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: () => apiFetch<ScopeOverview>(prefix(projectId)),
    enabled: Boolean(projectId),
  });
}
function useScopeInvalidation(projectId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: key(projectId) });
    void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
}
export function useProposeProjectScope(projectId: string) {
  const invalidate = useScopeInvalidation(projectId);
  return useMutation({
    mutationFn: (proposal: NewScopeProposal) =>
      apiFetch<ScopeProposal>(`${prefix(projectId)}proposals/`, {
        method: 'POST', body: JSON.stringify(proposal),
      }),
    onSuccess: invalidate,
  });
}
export function useDecideProjectScope(projectId: string) {
  const invalidate = useScopeInvalidation(projectId);
  return useMutation({
    mutationFn: (input: {
      proposalId: string;
      decision: 'approved' | 'changes_requested' | 'rejected';
      feedback: string;
    }) => apiFetch<{ proposal: ScopeProposal; approved_version: ScopeVersion | null }>(
      `${prefix(projectId)}proposals/${input.proposalId}/decision/`, {
        method: 'POST', body: JSON.stringify({
          decision: input.decision, feedback: input.feedback,
        }),
      },
    ),
    onSuccess: invalidate,
  });
}
export function useRequestProjectScopeChange(projectId: string) {
  const invalidate = useScopeInvalidation(projectId);
  return useMutation({
    mutationFn: (input: NewScopeChange) =>
      apiFetch<ScopeChangeRequest>(`${prefix(projectId)}change-requests/`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}
export function useReviewProjectScopeChange(projectId: string) {
  const invalidate = useScopeInvalidation(projectId);
  return useMutation({
    mutationFn: (input: {
      changeId: string;
      decision: 'under_review' | 'rejected';
      review_note: string;
    }) => apiFetch<ScopeChangeRequest>(
      `${prefix(projectId)}change-requests/${input.changeId}/review/`, {
        method: 'POST', body: JSON.stringify({
          decision: input.decision, review_note: input.review_note,
        }),
      },
    ),
    onSuccess: invalidate,
  });
}
