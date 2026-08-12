import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { CalendarEvent } from '@/types/events';

interface EventFilters {
  status?: string;
  mine?:   boolean;
}

function buildQuery(params?: EventFilters): string {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.mine)   sp.set('mine', '1');
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function useEvents(params?: EventFilters) {
  return useQuery({
    queryKey:      ['events', params],
    queryFn:       () => apiFetch<CalendarEvent[]>(`/api/events/${buildQuery(params)}`),
    staleTime:     30_000,
    refetchInterval: 60_000,
  });
}

export function useMyUpcomingEvents() {
  return useQuery({
    queryKey:        ['events', 'my-upcoming'],
    queryFn:         () => apiFetch<CalendarEvent[]>('/api/events/?mine=1&status=pending'),
    staleTime:       30_000,
    refetchInterval: 60_000,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title:              string;
      description?:       string;
      event_dt:           string;
      assigned_agent_ids: string[];
      linked_ticket_ref?: string;
    }) => apiFetch<CalendarEvent>('/api/events/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{
      title:              string;
      description:        string;
      event_dt:           string;
      status:             string;
      assigned_agent_ids: string[];
      linked_ticket_ref:  string | null;
    }>) => apiFetch<CalendarEvent>(`/api/events/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useDeleteEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/api/events/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}
