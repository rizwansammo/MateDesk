import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface ProjectSupportTicket {
  id: string;
  ref: string;
  subject: string;
  status: string;
  priority: string;
  requester: string | null;
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSupportPage {
  count: number;
  page: number;
  page_size: number;
  results: ProjectSupportTicket[];
}

export type ProjectActivityKind =
  | 'project_created' | 'project_updated'
  | 'work_item_created' | 'work_item_updated'
  | 'milestone_created' | 'milestone_updated'
  | 'client_feedback' | 'staff_feedback'
  | 'ticket_linked' | 'support_ticket_created'
  | 'client_ticket_reply' | 'staff_ticket_reply';

export interface ProjectActivityItem {
  id: string;
  kind: ProjectActivityKind;
  summary: string;
  actor: string;
  visibility: 'internal' | 'client';
  href: string;
  created_at: string;
  is_mine: boolean;
}

export interface ProjectActivityFeed {
  results: ProjectActivityItem[];
  count: number;
  page: number;
  page_size: number;
  has_more: boolean;
  unread_count: number;
  last_seen_at: string | null;
}

export function useProjectSupportTickets(projectId: string, page: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'supportTickets', page],
    queryFn: () => apiFetch<ProjectSupportPage>(
      '/api/projects/' + projectId + '/support-tickets/?page=' + page,
    ),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectSupportTicket(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FormData) => apiFetch<{ id: string; ref: string; project_id: string; work_item_id: string | null }>(
      '/api/projects/' + projectId + '/support-tickets/', {
        method: 'POST', body: payload,
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'supportTickets'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['ticketStats'] });
    },
  });
}

export function useProjectActivity(projectId: string, page: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'activity', page],
    queryFn: () => apiFetch<ProjectActivityFeed>('/api/projects/' + projectId + '/activity/?page=' + page),
    enabled: Boolean(projectId),
    refetchInterval: 60_000,
  });
}

export function useReadProjectActivity(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ last_seen_at: string | null; unread_count: number }>(
      '/api/projects/' + projectId + '/activity/read/', { method: 'POST' },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
    },
  });
}
