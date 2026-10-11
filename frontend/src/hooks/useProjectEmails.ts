import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface ProjectEmailReviewer {
  id: string;
  name: string;
  email: string;
}
export interface ProjectEmailDelivery {
  id: string;
  recipient: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
}
export interface WorkItemNotifications {
  reviewers: ProjectEmailReviewer[];
  notifications: ProjectEmailDelivery[];
}

export function useWorkItemEmailNotifications(workItemId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['workItems', workItemId, 'emailNotifications'],
    queryFn: () => apiFetch<WorkItemNotifications>(`/api/work-items/${workItemId}/email-notifications/`),
    enabled: Boolean(workItemId) && enabled,
  });
}
export function useSendWorkItemNotification(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { recipient_id: string; idempotency_key: string; note: string }) =>
      apiFetch<{ id: string; status: string }>(`/api/work-items/${workItemId}/email-notifications/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({
      queryKey: ['workItems', workItemId, 'emailNotifications'],
    }),
  });
}
