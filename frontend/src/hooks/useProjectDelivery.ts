import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type DeliveryDecision = 'pending' | 'changes_requested' | 'approved';
export interface DeliveryReview {
  id: string;
  round_number: number;
  status: DeliveryDecision;
  summary: string;
  delivery_url: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  feedback: string;
  submitted_at: string;
  reviewed_at: string | null;
}
export interface DeliveryReadiness {
  work_items: number;
  done: number;
  cancelled: number;
  unfinished: number;
  milestones: number;
  incomplete_milestones: number;
  open_support_tickets: number;
  has_client_reviewer: boolean;
  ready: boolean;
  blockers: string[];
}
export interface ProjectDelivery {
  project_id: string;
  project_status: string;
  completed_at: string | null;
  archived_at: string | null;
  latest: DeliveryReview | null;
  history: DeliveryReview[];
  has_more: boolean;
  readiness: DeliveryReadiness | null;
  can_submit: boolean;
  review_requires_resubmission: boolean;
  can_review: boolean;
}
function invalidateDelivery(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: ['projects', id] });
  void qc.invalidateQueries({ queryKey: ['projects', id, 'delivery'] });
  void qc.invalidateQueries({ queryKey: ['projects', id, 'activity'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  void qc.invalidateQueries({ queryKey: ['work-queue'] });
}
export function useProjectDelivery(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'delivery'],
    queryFn: () => apiFetch<ProjectDelivery>('/api/projects/' + projectId + '/delivery/'),
    enabled: Boolean(projectId),
  });
}
export function useSubmitProjectDelivery(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { summary: string; delivery_url?: string }) =>
      apiFetch<DeliveryReview>('/api/projects/' + projectId + '/delivery/submit/', {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidateDelivery(qc, projectId),
  });
}
export function useDecideProjectDelivery(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { decision: 'approved' | 'changes_requested'; feedback?: string }) =>
      apiFetch<DeliveryReview>('/api/projects/' + projectId + '/delivery/decision/', {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidateDelivery(qc, projectId),
  });
}
export function useDeliveryAction(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'complete' | 'archive' | 'reopen') =>
      apiFetch<{ status: string }>('/api/projects/' + projectId + '/delivery/' + action + '/', {
        method: 'POST', body: JSON.stringify({}),
      }),
    onSuccess: () => invalidateDelivery(qc, projectId),
  });
}
