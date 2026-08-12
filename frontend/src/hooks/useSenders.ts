import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface KnownSender {
  id:         number;
  email:      string;
  name:       string;
  org_id:     string;
  org_name:   string;
  created_at: string;
}

export interface AssignSenderPayload {
  ticket_ref?:          string;
  email?:               string;
  name?:                string;
  client_org_id:        string;
  move_walkin_tickets?: boolean;
}

export interface AssignSenderResult {
  email:         string;
  org_name:      string;
  tickets_moved: number;
}

export function useSenders(orgId?: string) {
  return useQuery({
    queryKey: ['senders', orgId ?? 'all'],
    queryFn:  () => apiFetch<KnownSender[]>(
      orgId ? `/api/senders/?org_id=${orgId}` : '/api/senders/'
    ),
  });
}

export function useAssignSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignSenderPayload) =>
      apiFetch<AssignSenderResult>('/api/senders/assign/', {
        method: 'POST',
        body:   JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['senders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useDeleteSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/senders/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['senders'] }),
  });
}
