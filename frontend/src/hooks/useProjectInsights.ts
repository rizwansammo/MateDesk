import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { CreateProject, Project } from '@/types/projects';

export interface StatusCount { status: string; count: number }
export interface PriorityCount { priority: string; count: number }
export interface StaffWorkload {
  staff_id: string; name: string; assigned: number; completed: number;
  overdue: number; estimated_minutes: number; tracked_minutes: number;
}
export interface ProjectReport {
  project_id: string;
  project_key: string;
  project_name: string;
  project_status: string;
  as_of: string;
  is_client_view: boolean;
  start_date: string | null;
  due_date: string | null;
  work_items: {
    total: number; active: number; done: number; cancelled: number;
    overdue: number; completion_percent: number;
  };
  milestones: { total: number; completed: number; overdue: number };
  status_distribution: StatusCount[];
  priority_distribution: PriorityCount[];
  time?: { tracked_minutes: number; billable_minutes: number; non_billable_minutes: number; scope: 'own' | 'project' };
  effort?: { estimated_minutes: number; tracked_minutes: number; variance_minutes: number };
  team?: StaffWorkload[];
}
export interface ProjectTimeline {
  project_id: string; start_date: string | null; due_date: string | null; as_of: string;
  milestones: {
    id: string; name: string; status: string; start_date: string | null;
    due_date: string | null; visibility: string; progress_percent: number; overdue: boolean;
  }[];
  work_items: {
    id: string; ref: string; title: string; kind: string; status: string;
    priority: string; visibility: string; start_date: string | null;
    due_date: string | null; milestone_id: string | null;
    dependencies: string[]; overdue: boolean; estimated_minutes: number | null;
  }[];
}
export interface ProjectTemplateInfo {
  id: string; name: string; description: string; milestone_count: number;
  work_item_count: number; source_project_id: string | null; version: number; created_at: string;
}
export interface ProjectTemplatePreview extends ProjectTemplateInfo {
  snapshot: {
    version: number;
    project_description: string;
    milestones: { name: string; description: string; visibility: string }[];
    work_items: { title: string; description: string; visibility: string; kind: string }[];
  };
}
export interface PortfolioPage {
  count: number; page: number; page_size: number; has_more: boolean;
  results: ProjectReport[];
}

export function useProjectReport(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'reports'],
    queryFn: () => apiFetch<ProjectReport>(`/api/projects/${projectId}/reports/`),
    enabled: Boolean(projectId) && enabled,
  });
}
export function useProjectTimeline(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'timeline'],
    queryFn: () => apiFetch<ProjectTimeline>(`/api/projects/${projectId}/timeline/`),
    enabled: Boolean(projectId) && enabled,
  });
}
export function useProjectPortfolio(page = 1) {
  return useQuery({
    queryKey: ['projects', 'portfolio', page],
    queryFn: () => apiFetch<PortfolioPage>(`/api/projects/reports/?page=${page}`),
  });
}
export function useProjectTemplates(enabled = true) {
  return useQuery({
    queryKey: ['projects', 'templates'],
    queryFn: () => apiFetch<ProjectTemplateInfo[]>('/api/projects/templates/'),
    enabled,
  });
}
export function useProjectTemplatePreview(templateId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', 'templates', templateId],
    queryFn: () => apiFetch<ProjectTemplatePreview>(`/api/projects/templates/${templateId}/`),
    enabled: Boolean(templateId) && enabled,
  });
}
export function useCaptureProjectTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      apiFetch<ProjectTemplateInfo>(`/api/projects/${projectId}/templates/capture/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects', 'templates'] }),
  });
}
export function useApplyProjectTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      apiFetch<{ project_id: string; milestones_created: number; work_items_created: number }>(
        `/api/projects/${projectId}/templates/${templateId}/apply/`, {
          method: 'POST', body: JSON.stringify({}),
        },
      ),
    onSuccess: () => void Promise.all([
      qc.invalidateQueries({ queryKey: ['projects', projectId] }),
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] }),
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'workItems'] }),
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'timeline'] }),
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'reports'] }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
    ]),
  });
}
export function useDeleteProjectTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/projects/templates/${id}/`, {
      method: 'DELETE',
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects', 'templates'] }),
  });
}
export function useCreateProjectFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProject & { template_id: string }) => {
      const { template_id, ...fields } = payload;
      return apiFetch<Project>(`/api/projects/templates/${template_id}/create-project/`, {
        method: 'POST', body: JSON.stringify(fields),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
