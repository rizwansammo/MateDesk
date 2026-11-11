import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type TimeReviewState = 'pending' | 'approved' | 'rejected';

export interface ProjectTimeEntry {
  id: string;
  project_id: string;
  work_item_id: string;
  work_item_ref: string;
  work_item_title: string;
  staff_id: string | null;
  staff_name: string;
  spent_on: string;
  minutes: number;
  description: string;
  billable: boolean;
  review_state: TimeReviewState;
  review_note: string;
  reviewed_by_name: string | null;
  invoice_number: string | null;
  is_invoiced: boolean;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryPage {
  count: number;
  page: number;
  page_size: number;
  has_more: boolean;
  results: ProjectTimeEntry[];
  can_manage: boolean;
}

export interface ProjectTimeSummary {
  entries: number;
  total_minutes: number;
  billable_minutes: number;
  non_billable_minutes: number;
  approved_minutes: number;
  pending_minutes: number;
  by_work_item: { work_item_id: string; work_item_ref: string; minutes: number }[];
  by_staff: { staff_name: string; minutes: number }[];
  can_manage: boolean;
  ready_minutes?: number;
  ready_entries?: number;
  hourly_rate?: string | null;
  currency?: string | null;
  estimated_unbilled_amount?: string | null;
}

export interface ProjectTimeRate {
  hourly_rate: string | null;
  currency: string;
  updated_at: string | null;
}

export interface ProjectTimeInvoice {
  invoice_id: string;
  invoice_number: string;
  status: string;
  currency: string;
  total: string;
  period_from: string;
  period_to: string;
  created_at: string;
}

export interface InvoiceResponse {
  id: string;
  invoice_number: string;
  status: string;
  currency: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  line_items: { id: string; minutes: number; amount: string; description: string }[];
}

export interface TimeEntryWrite {
  work_item_id: string;
  spent_on: string;
  minutes: number;
  description: string;
  billable: boolean;
  request_id: string;
}

export interface TimeEntryEdit {
  spent_on?: string;
  minutes?: number;
  description?: string;
  billable?: boolean;
}

function refreshTime(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  void qc.invalidateQueries({ queryKey: ['projects', projectId, 'time'] });
  void qc.invalidateQueries({ queryKey: ['projects', projectId, 'timeRate'] });
  void qc.invalidateQueries({ queryKey: ['projects', projectId, 'timeInvoices'] });
}

export function useProjectTimeEntries(projectId: string, page: number, workItemId?: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'time', 'entries', page, workItemId || 'all'],
    queryFn: () => apiFetch<TimeEntryPage>(
      `/api/projects/${projectId}/time-entries/?page=${page}${workItemId ? `&work_item_id=${workItemId}` : ''}`,
    ),
    enabled: Boolean(projectId),
  });
}

export function useProjectTimeSummary(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'time', 'summary'],
    queryFn: () => apiFetch<ProjectTimeSummary>(`/api/projects/${projectId}/time-summary/`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useProjectTimeRate(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'timeRate'],
    queryFn: () => apiFetch<ProjectTimeRate>(`/api/projects/${projectId}/time-rate/`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useProjectTimeInvoices(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'timeInvoices'],
    queryFn: () => apiFetch<ProjectTimeInvoice[]>(`/api/projects/${projectId}/time-invoices/`),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useLogProjectTime(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TimeEntryWrite) => apiFetch<ProjectTimeEntry>(
      `/api/projects/${projectId}/time-entries/`, {
        method: 'POST', body: JSON.stringify(payload),
      },
    ),
    onSuccess: () => refreshTime(qc, projectId),
  });
}

export function useEditProjectTime(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: TimeEntryEdit }) =>
      apiFetch<ProjectTimeEntry>(`/api/projects/${projectId}/time-entries/${id}/`, {
        method: 'PATCH', body: JSON.stringify(changes),
      }),
    onSuccess: () => refreshTime(qc, projectId),
  });
}

export function useReviewProjectTime(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note = '' }: {
      id: string; decision: 'approved' | 'rejected'; note?: string;
    }) => apiFetch<ProjectTimeEntry>(
      `/api/projects/${projectId}/time-entries/${id}/review/`, {
        method: 'POST', body: JSON.stringify({ decision, note }),
      },
    ),
    onSuccess: () => refreshTime(qc, projectId),
  });
}

export function useSaveProjectTimeRate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { hourly_rate: string; currency: string }) =>
      apiFetch<ProjectTimeRate>(`/api/projects/${projectId}/time-rate/`, {
        method: 'PUT', body: JSON.stringify(payload),
      }),
    onSuccess: () => refreshTime(qc, projectId),
  });
}

export function useCreateProjectTimeInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      period_from: string; period_to: string; tax_rate: string; request_id: string;
    }) => apiFetch<InvoiceResponse>(`/api/projects/${projectId}/time-invoices/`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    onSuccess: () => refreshTime(qc, projectId),
  });
}

export function useVoidProjectTimeInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => apiFetch<void>(
      `/api/projects/${projectId}/time-invoices/${invoiceId}/void/`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
    onSuccess: () => refreshTime(qc, projectId),
  });
}
