import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { WorkItemKind, WorkItemPriority, WorkVisibility } from '@/types/projects';
import type {
  TicketProjectAssociation, CreatedTicketWorkItem, WorkItemSupportTicket,
} from '@/types/ticketProjects';

const associationKey = (ref: string) => ['ticketProjectAssociation', ref] as const;
const assocUrl = (ref: string) => `/api/tickets/${encodeURIComponent(ref)}/project-association/`;
const workUrl = (ref: string) => `/api/tickets/${encodeURIComponent(ref)}/project-work-items/`;

export function useTicketProjectAssociation(ref: string) {
  return useQuery({
    queryKey: associationKey(ref),
    queryFn: () => apiFetch<TicketProjectAssociation>(assocUrl(ref)),
    enabled: Boolean(ref),
  });
}

export function useLinkTicketProject(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project_id: string) => apiFetch<TicketProjectAssociation>(assocUrl(ref), {
      method: 'PUT', body: JSON.stringify({ project_id }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: associationKey(ref) }),
  });
}

export function useUnlinkTicketProject(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(assocUrl(ref), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: associationKey(ref) }),
  });
}

export function useLinkTicketWorkItem(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (work_item_id: string) => apiFetch<TicketProjectAssociation>(workUrl(ref), {
      method: 'POST', body: JSON.stringify({ work_item_id }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: associationKey(ref) }),
  });
}

export function useUnlinkTicketWorkItem(ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workItemId: string) => apiFetch<void>(`${workUrl(ref)}${workItemId}/`, {
      method: 'DELETE',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: associationKey(ref) }),
  });
}

export function useCreateLinkedTicketWorkItem(ref: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      title: string;
      description?: string;
      kind?: WorkItemKind;
      priority?: WorkItemPriority;
      visibility?: WorkVisibility;
      assignee_id?: string;
    }) => apiFetch<CreatedTicketWorkItem>(`${workUrl(ref)}create/`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: associationKey(ref) });
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'workItems'] });
    },
  });
}

export function useWorkItemSupportTickets(workItemId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['workItems', workItemId, 'supportTickets'],
    queryFn: () => apiFetch<WorkItemSupportTicket[]>(`/api/work-items/${workItemId}/support-tickets/`),
    enabled: Boolean(workItemId) && enabled,
  });
}
