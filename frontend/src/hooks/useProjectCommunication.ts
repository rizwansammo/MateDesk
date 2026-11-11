import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type MessageVisibility = 'internal' | 'client';

export interface ProjectMessage {
  id: string;
  body: string;
  visibility: MessageVisibility;
  author: string;
  is_mine: boolean;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  summary: string;
  actor: string;
  visibility: MessageVisibility;
  href: string;
  created_at: string;
  is_mine: boolean;
  project_id: string;
  project_name: string;
  project_key: string;
  is_unread: boolean;
}

export interface CommunicationPage<T> {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export type NotificationPage = CommunicationPage<NotificationItem> & { unread_count: number };

export function useProjectConversation(projectId: string, page: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'conversation', page],
    queryFn: () => apiFetch<CommunicationPage<ProjectMessage>>(
      `/api/projects/${projectId}/conversation/?page=${page}`,
    ),
    enabled: Boolean(projectId),
  });
}

export function useSendProjectMessage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { body: string; visibility: MessageVisibility; request_id: string }) =>
      apiFetch<ProjectMessage>(`/api/projects/${projectId}/conversation/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'conversation'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
      void qc.invalidateQueries({ queryKey: ['projects', 'notifications'] });
    },
  });
}

export function useProjectNotificationInbox(page: number) {
  return useQuery({
    queryKey: ['projects', 'notifications', page],
    queryFn: () => apiFetch<NotificationPage>(`/api/projects/notifications/?page=${page}`),
    refetchInterval: 60000,
  });
}

export function useReviewProjectNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<{ last_seen_at: string | null; unread_count: number }>(
        `/api/projects/${projectId}/activity/read/`, { method: 'POST' },
      ),
    onSuccess: (_response, projectId) => {
      void qc.invalidateQueries({ queryKey: ['projects', 'notifications'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
