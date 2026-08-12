import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { SLAPolicy, VIPRule } from '@/types/sla';

// ── SLA Policies ─────────────────────────────────────────────────────────────

export function useSLAPolicies() {
  return useQuery<SLAPolicy[]>({
    queryKey: ['sla-policies'],
    queryFn:  () => apiFetch('/api/sla/policies/'),
  });
}

export function useCreateSLAPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SLAPolicy>) => apiFetch('/api/sla/policies/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sla-policies'] }),
  });
}

export function useUpdateSLAPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SLAPolicy> }) =>
      apiFetch(`/api/sla/policies/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla-policies'] }),
  });
}

export function useDeleteSLAPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/sla/policies/${id}/`, { method: 'DELETE' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sla-policies'] }),
  });
}

// ── VIP Rule ─────────────────────────────────────────────────────────────────

export function useVIPRule() {
  return useQuery<VIPRule>({
    queryKey: ['vip-rule'],
    queryFn:  () => apiFetch('/api/sla/vip-rule/'),
  });
}

export function useUpdateVIPRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VIPRule>) =>
      apiFetch('/api/sla/vip-rule/', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vip-rule'] }),
  });
}

// ── VIP Users ─────────────────────────────────────────────────────────────────

export interface VIPUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  org_id: string | null;
  org_name: string | null;
  is_vip: boolean;
  is_active: boolean;
}

export function useAllClientUsers() {
  return useQuery<VIPUser[]>({
    queryKey: ['all-client-users'],
    queryFn:  () => apiFetch('/api/users/'),
  });
}

export function useToggleVIPUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_vip }: { id: string; is_vip: boolean }) =>
      apiFetch(`/api/users/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_vip }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-client-users'] }),
  });
}
