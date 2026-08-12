import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ClientOrg } from '@/types/tickets';

export function useClientOrgs() {
  return useQuery({
    queryKey:  ['clientOrgs'],
    queryFn:   () => apiFetch<ClientOrg[]>('/api/client-orgs/'),
    staleTime: 60_000,
  });
}
