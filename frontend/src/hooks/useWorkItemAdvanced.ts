import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface WorkItemDependency {
  id: string | null;
  prerequisite_id: string | null;
  ref: string | null;
  title: string;
  status: string | null;
  completed: boolean | null;
  internal: boolean;
}
export interface ChecklistEntry {
  id: string;
  title: string;
  visibility: 'internal' | 'client';
  is_done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  completed_by_name: string | null;
}
export type ChecklistInput = {
  title: string;
  visibility: 'internal' | 'client';
  position?: number;
};

const dependenciesPath = (id: string) => `/api/work-items/${id}/dependencies/`;
const checklistPath = (id: string) => `/api/work-items/${id}/checklist/`;
const dependenciesKey = (id: string) => ['workItems', id, 'dependencies'] as const;
const checklistKey = (id: string) => ['workItems', id, 'checklist'] as const;

function useAdvancedWorkRefresh(projectId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['workItems'] });
    void client.invalidateQueries({ queryKey: ['projects', projectId, 'workItems'] });
    void client.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
    void client.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
  };
}
export function useWorkItemDependencies(itemId: string) {
  return useQuery({
    queryKey: dependenciesKey(itemId),
    queryFn: () => apiFetch<WorkItemDependency[]>(dependenciesPath(itemId)),
    enabled: Boolean(itemId),
  });
}
export function useAddWorkItemDependency(projectId: string, itemId: string) {
  const refresh = useAdvancedWorkRefresh(projectId);
  return useMutation({
    mutationFn: (prerequisiteId: string) => apiFetch<WorkItemDependency>(
      dependenciesPath(itemId), {
        method: 'POST', body: JSON.stringify({ prerequisite_id: prerequisiteId }),
      },
    ),
    onSuccess: refresh,
  });
}
export function useRemoveWorkItemDependency(projectId: string, itemId: string) {
  const refresh = useAdvancedWorkRefresh(projectId);
  return useMutation({
    mutationFn: (dependencyId: string) => apiFetch<void>(
      `${dependenciesPath(itemId)}${dependencyId}/`, { method: 'DELETE' },
    ),
    onSuccess: refresh,
  });
}
export function useWorkItemChecklist(itemId: string) {
  return useQuery({
    queryKey: checklistKey(itemId),
    queryFn: () => apiFetch<ChecklistEntry[]>(checklistPath(itemId)),
    enabled: Boolean(itemId),
  });
}
export function useAddWorkItemChecklist(projectId: string, itemId: string) {
  const refresh = useAdvancedWorkRefresh(projectId);
  return useMutation({
    mutationFn: (item: ChecklistInput) =>
      apiFetch<ChecklistEntry>(checklistPath(itemId), {
        method: 'POST', body: JSON.stringify(item),
      }),
    onSuccess: refresh,
  });
}
export function useUpdateWorkItemChecklist(projectId: string, itemId: string) {
  const refresh = useAdvancedWorkRefresh(projectId);
  return useMutation({
    mutationFn: ({ entryId, changes }: {
      entryId: string;
      changes: Partial<ChecklistInput> & { is_done?: boolean };
    }) => apiFetch<ChecklistEntry>(`${checklistPath(itemId)}${entryId}/`, {
      method: 'PATCH', body: JSON.stringify(changes),
    }),
    onSuccess: refresh,
  });
}
export function useRemoveWorkItemChecklist(projectId: string, itemId: string) {
  const refresh = useAdvancedWorkRefresh(projectId);
  return useMutation({
    mutationFn: (entryId: string) =>
      apiFetch<void>(`${checklistPath(itemId)}${entryId}/`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}
