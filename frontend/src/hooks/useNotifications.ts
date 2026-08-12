import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface ApiNotification {
  id:          string;
  notif_type:  'new_ticket' | 'assigned' | 'new_reply';
  message:     string;
  is_read:     boolean;
  created_at:  string;
  actor_name:  string | null;
  ticket_ref:  string | null;
  ticket_id:   string | null;
}

interface NotificationsResponse {
  results:      ApiNotification[];
  unread_count: number;
}

export function useNotifications() {
  const qc = useQueryClient();

  const query = useQuery<NotificationsResponse>({
    queryKey:          ['notifications'],
    queryFn:           () => apiFetch<NotificationsResponse>('/api/notifications/'),
    refetchInterval:   30_000,
    staleTime:         20_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read/`, { method: 'POST' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch('/api/notifications/read-all/', { method: 'POST' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return {
    notifications: query.data?.results      ?? [],
    unreadCount:   query.data?.unread_count  ?? 0,
    isLoading:     query.isLoading,
    markRead:      (id: string) => markRead.mutate(id),
    markAllRead:   () => markAllRead.mutate(),
    refetch:       query.refetch,
  };
}
