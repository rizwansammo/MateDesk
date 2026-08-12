import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  PaginatedTickets, TicketDetail, TicketStats, TicketReply,
  AgentStat, ActivityItem, VolumeDay, CustomerHistory, TimeLog,
} from '@/types/tickets';

interface TicketFilters {
  status?:       string;
  priority?:     string;
  search?:       string;
  page?:         number;
  requester_id?: string;
  assignee_id?:  string;
  org_id?:       string;
  group_id?:     string;
}

function buildQuery(params?: TicketFilters): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.status === 'unassigned') {
    sp.set('assignee', 'none');
  } else if (params.status) {
    sp.set('status', params.status);
  }
  if (params.priority)     sp.set('priority',     params.priority);
  if (params.search)       sp.set('search',       params.search);
  if (params.requester_id) sp.set('requester_id', params.requester_id);
  if (params.assignee_id)  sp.set('assignee_id',  params.assignee_id);
  if (params.org_id)       sp.set('org_id',       params.org_id);
  if (params.group_id)     sp.set('group_id',     params.group_id);
  if (params.page && params.page > 1) sp.set('page', String(params.page));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function useTickets(params?: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', params],
    queryFn:  () => apiFetch<PaginatedTickets>(`/api/tickets/${buildQuery(params)}`),
  });
}

export function useTicket(ref: string) {
  return useQuery({
    queryKey: ['ticket', ref],
    queryFn:  () => apiFetch<TicketDetail>(`/api/tickets/${ref}/`),
    enabled:  !!ref,
  });
}

export function useTicketStats() {
  return useQuery({
    queryKey:  ['ticketStats'],
    queryFn:   () => apiFetch<TicketStats>('/api/stats/'),
    staleTime: 30_000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<TicketDetail>('/api/tickets/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticketStats'] });
    },
  });
}

export function useUpdateTicket(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<TicketDetail>(`/api/tickets/${ref}/`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ref] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticketStats'] });
    },
  });
}

export function useAgentStats() {
  return useQuery({
    queryKey:  ['agentStats'],
    queryFn:   () => apiFetch<AgentStat[]>('/api/stats/agents/'),
    staleTime: 60_000,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey:  ['recentActivity'],
    queryFn:   () => apiFetch<ActivityItem[]>('/api/stats/activity/'),
    staleTime: 30_000,
  });
}

export function useVolumeByDay() {
  return useQuery({
    queryKey:  ['volumeByDay'],
    queryFn:   () => apiFetch<VolumeDay[]>('/api/stats/volume/'),
    staleTime: 60_000,
  });
}

export function useUserTickets(userId: string, isStaff: boolean | undefined) {
  return useQuery({
    queryKey: ['user-tickets', userId, isStaff],
    queryFn:  () => {
      const filter = isStaff ? `assignee_id=${userId}` : `requester_id=${userId}`;
      return apiFetch<PaginatedTickets>(`/api/tickets/?${filter}`);
    },
    enabled: !!userId && isStaff !== undefined,
  });
}

export function useAddSecondaryAgent(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      apiFetch<TicketDetail>(`/api/tickets/${ref}/secondary-agents/`, {
        method: 'POST',
        body:   JSON.stringify({ agent_id: agentId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ref] }),
  });
}

export function useRemoveSecondaryAgent(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      apiFetch<TicketDetail>(`/api/tickets/${ref}/secondary-agents/${agentId}/`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ref] }),
  });
}

export function useAddTimeLog(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { minutes: number; date: string; description?: string }) =>
      apiFetch<TimeLog>(`/api/tickets/${ref}/timelogs/add/`, {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ref] }),
  });
}

export function useDeleteTimeLog(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logId: string) =>
      apiFetch<void>(`/api/tickets/${ref}/timelogs/${logId}/delete/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ref] }),
  });
}

export function useMergeTicket(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetRef: string) =>
      apiFetch<TicketDetail>(`/api/tickets/${ref}/merge/`, {
        method: 'POST',
        body:   JSON.stringify({ target_ref: targetRef }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ref] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useAbsorbTicket(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceRef: string) =>
      apiFetch<TicketDetail>(`/api/tickets/${ref}/absorb/`, {
        method: 'POST',
        body:   JSON.stringify({ source_ref: sourceRef }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ref] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useCustomerHistory(ref: string) {
  return useQuery({
    queryKey: ['customer-history', ref],
    queryFn:  () => apiFetch<CustomerHistory>(`/api/tickets/${ref}/customer-history/`),
    enabled:  !!ref,
  });
}

export function useAddReply(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type:            string;
      body:            string;
      images?:         File[];
      to_emails?:      string[];
      cc_emails?:      string[];
      bcc_emails?:     string[];
      include_history?: boolean;
    }) => {
      if (data.images && data.images.length > 0) {
        const fd = new FormData();
        fd.append('type', data.type);
        fd.append('body', data.body);
        data.images.forEach(f => fd.append('images', f));
        if (data.to_emails?.length)  fd.append('to_emails',  JSON.stringify(data.to_emails));
        if (data.cc_emails?.length)  fd.append('cc_emails',  JSON.stringify(data.cc_emails));
        if (data.bcc_emails?.length) fd.append('bcc_emails', JSON.stringify(data.bcc_emails));
        fd.append('include_history', data.include_history ? 'true' : 'false');
        return apiFetch<TicketReply>(`/api/tickets/${ref}/replies/`, { method: 'POST', body: fd });
      }
      return apiFetch<TicketReply>(`/api/tickets/${ref}/replies/`, {
        method: 'POST',
        body:   JSON.stringify({
          type:            data.type,
          body:            data.body,
          to_emails:       data.to_emails       ?? [],
          cc_emails:       data.cc_emails        ?? [],
          bcc_emails:      data.bcc_emails       ?? [],
          include_history: data.include_history  ?? false,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ref] });
    },
  });
}
