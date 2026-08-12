import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { CannedCategory, CannedResponse } from '@/types/canned';

// ── Categories ────────────────────────────────────────────────────────────────

export function useCannedCategories() {
  return useQuery({
    queryKey: ['canned-categories'],
    queryFn:  () => apiFetch<CannedCategory[]>('/api/canned/categories/'),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<CannedCategory>('/api/canned/categories/', {
        method: 'POST', body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-categories'] }),
  });
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<CannedCategory>(`/api/canned/categories/${id}/`, {
        method: 'PATCH', body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-categories'] }),
  });
}

export function useDeleteCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/api/canned/categories/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-categories'] }),
  });
}

// ── Responses ─────────────────────────────────────────────────────────────────

interface ResponseFilters {
  category?: string;
  q?:        string;
}

export function useCannedResponses(params?: ResponseFilters) {
  return useQuery({
    queryKey: ['canned-responses', params],
    queryFn:  () => {
      const sp = new URLSearchParams();
      if (params?.category) sp.set('category', params.category);
      if (params?.q)        sp.set('q', params.q);
      const qs = sp.toString();
      return apiFetch<CannedResponse[]>(`/api/canned/responses/${qs ? `?${qs}` : ''}`);
    },
  });
}

export function useCreateResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { category: string; title: string; body: string }) =>
      apiFetch<CannedResponse>('/api/canned/responses/', {
        method: 'POST', body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-responses'] }),
  });
}

export function useUpdateResponse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{ title: string; body: string; category: string }>) =>
      apiFetch<CannedResponse>(`/api/canned/responses/${id}/`, {
        method: 'PATCH', body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-responses'] }),
  });
}

export function useDeleteResponse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/api/canned/responses/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-responses'] }),
  });
}
