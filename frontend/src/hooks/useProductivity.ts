import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface AgentTodo {
  id:         string;
  text:       string;
  completed:  boolean;
  created_at: string;
}

export interface Announcement {
  id:             string;
  title:          string;
  body:           string;
  created_by:     string;
  recipient_mode: 'all' | 'specific';
  created_at:     string;
}

// ── Todos ────────────────────────────────────────────────────────────────────

export function useAgentTodos() {
  return useQuery({
    queryKey: ['agent-todos'],
    queryFn:  () => apiFetch<AgentTodo[]>('/api/productivity/todos/'),
  });
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<AgentTodo>('/api/productivity/todos/', { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-todos'] }),
  });
}

export function useToggleTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiFetch<AgentTodo>(`/api/productivity/todos/${id}/`, { method: 'PATCH', body: JSON.stringify({ completed }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-todos'] }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/productivity/todos/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-todos'] }),
  });
}

// ── Announcements ─────────────────────────────────────────────────────────────

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn:  () => apiFetch<Announcement[]>('/api/productivity/announcements/'),
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; body: string; recipient_mode: 'all' | 'specific'; recipient_ids?: string[] }) =>
      apiFetch<Announcement>('/api/productivity/announcements/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/productivity/announcements/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}
