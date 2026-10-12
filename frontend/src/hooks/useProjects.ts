import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  CreateProject, UpdateProject, Project, ProjectMember,
  ProjectMilestone, CreateMilestone, UpdateMilestone,
  WorkItem, CreateWorkItem, UpdateWorkItem, WorkItemComment, ProjectRole, WorkVisibility,
} from '@/types/projects';

const projectKey = (id: string) => ['projects', id] as const;

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Project[]>('/api/projects/'),
  });
}
export function useProject(id: string) {
  return useQuery({
    queryKey: projectKey(id),
    queryFn: () => apiFetch<Project>(`/api/projects/${id}/`),
    enabled: Boolean(id),
  });
}
export function useProjectMilestones(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'milestones'],
    queryFn: () => apiFetch<ProjectMilestone[]>(`/api/projects/${id}/milestones/`),
    enabled: Boolean(id),
  });
}
export function useProjectWorkItems(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'workItems'],
    queryFn: () => apiFetch<WorkItem[]>(`/api/projects/${id}/work-items/`),
    enabled: Boolean(id),
  });
}
export function useProjectMembers(id: string, canManage: boolean) {
  return useQuery({
    queryKey: ['projects', id, 'members'],
    queryFn: () => apiFetch<ProjectMember[]>(`/api/projects/${id}/members/`),
    enabled: Boolean(id) && canManage,
  });
}
export function useWorkItem(id: string) {
  return useQuery({
    queryKey: ['workItems', id],
    queryFn: () => apiFetch<WorkItem>(`/api/work-items/${id}/`),
    enabled: Boolean(id),
  });
}
export function useWorkItemComments(id: string) {
  return useQuery({
    queryKey: ['workItems', id, 'comments'],
    queryFn: () => apiFetch<WorkItemComment[]>(`/api/work-items/${id}/comments/`),
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProject) =>
      apiFetch<Project>('/api/projects/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProject) =>
      apiFetch<Project>(`/api/projects/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: projectKey(id) });
    },
  });
}
export function useCreateMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMilestone) =>
      apiFetch<ProjectMilestone>(`/api/projects/${projectId}/milestones/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
    },
  });
}
export function useUpdateMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateMilestone }) =>
      apiFetch<ProjectMilestone>(`/api/projects/${projectId}/milestones/${id}/`, {
        method: 'PATCH', body: JSON.stringify(changes),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'milestones'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
    },
  });
}
export function useCreateWorkItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkItem) =>
      apiFetch<WorkItem>(`/api/projects/${projectId}/work-items/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'workItems'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
    },
  });
}
export function useUpdateWorkItem(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateWorkItem }) =>
      apiFetch<WorkItem>(`/api/work-items/${id}/`, {
        method: 'PATCH', body: JSON.stringify(changes),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'workItems'] });
      qc.invalidateQueries({ queryKey: ['workItems', variables.id] });
      qc.invalidateQueries({ queryKey: ['projects', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
    },
  });
}
export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { user_id: string; role: ProjectRole }) =>
      apiFetch<ProjectMember>(`/api/projects/${projectId}/members/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'reviewerCandidates'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      apiFetch<void>(`/api/projects/${projectId}/members/${memberId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'reviewerCandidates'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
export function useAddWorkItemComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { body: string; visibility?: WorkVisibility }) =>
      apiFetch<WorkItemComment>(`/api/work-items/${id}/comments/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workItems', id, 'comments'] }),
  });
}
