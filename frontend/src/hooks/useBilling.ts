import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import type { BillingProfile, OrgRateEntry, OrgBillingRate, Invoice } from '@/types/billing';

export function useBillingProfile() {
  return useQuery({
    queryKey: ['billing-profile'],
    queryFn:  () => apiFetch<BillingProfile>('/api/billing/profile/'),
    staleTime: 60_000,
  });
}

export function useUpdateBillingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BillingProfile>) =>
      apiFetch<BillingProfile>('/api/billing/profile/', {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-profile'] }),
  });
}

export function useOrgRates() {
  return useQuery({
    queryKey: ['billing-rates'],
    queryFn:  () => apiFetch<OrgRateEntry[]>('/api/billing/rates/'),
    staleTime: 60_000,
  });
}

export function useUpdateOrgRate(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<OrgBillingRate>) =>
      apiFetch<OrgBillingRate>(`/api/billing/rates/${orgId}/`, {
        method: 'PUT',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-rates'] }),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ['billing-invoices'],
    queryFn:  () => apiFetch<Invoice[]>('/api/billing/invoices/'),
    staleTime: 30_000,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { org_id: string; period_from: string; period_to: string; tax_rate?: string }) =>
      apiFetch<Invoice>('/api/billing/invoices/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-invoices'] }),
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch<Invoice>(`/api/billing/invoices/${id}/`, {
        method: 'PATCH',
        body:   JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-invoices'] }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/billing/invoices/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-invoices'] }),
  });
}

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string) {
  const { blob, filename } = await apiFetchBlob(`/api/billing/invoices/${invoiceId}/pdf/`);
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename ?? `${invoiceNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
