import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { SupportGroup } from '@/types/tickets';

export function useGroups() {
  return useQuery({
    queryKey:  ['support-groups'],
    queryFn:   () => apiFetch<SupportGroup[]>('/api/support-groups/'),
    staleTime: 60_000,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiFetch<SupportGroup>('/api/support-groups/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-groups'] }),
  });
}

export function useUpdateGroup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      apiFetch<SupportGroup>(`/api/support-groups/${id}/`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-groups'] }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/support-groups/${id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-groups'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useAddGroupAgent(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      apiFetch(`/api/support-groups/${groupId}/agents/`, {
        method: 'POST',
        body:   JSON.stringify({ agent_id: agentId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-groups'] }),
  });
}

export function useRemoveGroupAgent(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      apiFetch(`/api/support-groups/${groupId}/agents/${agentId}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-groups'] }),
  });
}
