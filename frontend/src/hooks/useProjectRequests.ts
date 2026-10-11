import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  ProjectRequest, ProjectRequestStatus, WorkQueueFilter, WorkQueuePage,
  ProjectCapabilities, ProjectAgentPermission,
} from '@/types/projectRequests';

const requestKey = (id: string) => ['project-requests', id] as const;
const invalidateWorkflow = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['work-queue'] });
  void qc.invalidateQueries({ queryKey: ['project-requests'] });
  void qc.invalidateQueries({ queryKey: ['tickets'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
};

export function useWorkQueue(
  kind: WorkQueueFilter, page: number, query: string,
  scope: 'all' | 'attention' | 'mine' = 'all',
) {
  const qs = new URLSearchParams({ kind, page: String(page) });
  if (query) qs.set('q', query);
  if (scope === 'attention') qs.set('attention', '1');
  if (scope === 'mine') qs.set('assigned', 'mine');
  return useQuery({
    queryKey: ['work-queue', kind, page, query, scope],
    queryFn: () => apiFetch<WorkQueuePage>('/api/requests/workspace/?' + qs.toString()),
    refetchInterval: 60_000,
  });
}
export function useProjectRequest(id: string) {
  return useQuery({
    queryKey: requestKey(id),
    queryFn: () => apiFetch<ProjectRequest>('/api/project-requests/' + id + '/'),
    enabled: Boolean(id),
  });
}
export function useCreateProjectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FormData) => apiFetch<ProjectRequest>('/api/project-requests/', {
      method: 'POST', body: payload,
    }),
    onSuccess: () => invalidateWorkflow(qc),
  });
}
export function useClaimProjectRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ProjectRequest>('/api/project-requests/' + id + '/claim/', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requestKey(id) });
      invalidateWorkflow(qc);
    },
  });
}
export function useReviewProjectRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { status: Exclude<ProjectRequestStatus, 'submitted' | 'converted'>; note: string }) =>
      apiFetch<ProjectRequest>('/api/project-requests/' + id + '/', {
        method: 'PATCH', body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requestKey(id) });
      invalidateWorkflow(qc);
    },
  });
}
export function useConvertProjectRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { key: string; name?: string; due_date?: string | null }) =>
      apiFetch<ProjectRequest>('/api/project-requests/' + id + '/convert/', {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requestKey(id) });
      invalidateWorkflow(qc);
    },
  });
}
export function useProjectCapabilities() {
  return useQuery({
    queryKey: ['project-capabilities'],
    queryFn: () => apiFetch<ProjectCapabilities>('/api/projects/capabilities/'),
  });
}
export function useProjectAgentPermissions(enabled: boolean) {
  return useQuery({
    queryKey: ['project-agent-permissions'],
    queryFn: () => apiFetch<ProjectAgentPermission[]>('/api/projects/agent-permissions/'),
    enabled,
  });
}
export function useSetProjectAgentPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; can_create_projects: boolean }) =>
      apiFetch<{ id: string; can_create_projects: boolean }>('/api/projects/agent-permissions/' + payload.id + '/', {
        method: 'PUT', body: JSON.stringify({ can_create_projects: payload.can_create_projects }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project-agent-permissions'] });
      void qc.invalidateQueries({ queryKey: ['project-capabilities'] });
    },
  });
}
