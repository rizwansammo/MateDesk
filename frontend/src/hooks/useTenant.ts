import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface TenantDetail {
  id:            string;
  name:          string;
  slug:          string;
  plan:          string;
  timezone:      string;
  support_email: string;
  phone:         string;
  address:       string;
  website:       string;
  primary_color: string;
}

export function useTenant() {
  return useQuery({
    queryKey: ['tenant'],
    queryFn:  () => apiFetch<TenantDetail>('/api/tenant/'),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<TenantDetail>) =>
      apiFetch<TenantDetail>('/api/tenant/', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant'] }),
  });
}
