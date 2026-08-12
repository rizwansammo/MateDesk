import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Agent } from '@/types/tickets';

export function useAgents(groupId?: string | null) {
  const url = groupId ? `/api/agents/?group_id=${groupId}` : '/api/agents/';
  return useQuery({
    queryKey:  ['agents', groupId ?? null],
    queryFn:   () => apiFetch<Agent[]>(url),
    staleTime: 60_000,
  });
}
