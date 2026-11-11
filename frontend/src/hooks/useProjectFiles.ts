import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '@/lib/api';

export type ProjectFileCategory = 'library' | 'work_item' | 'delivery';
export type ProjectFileVisibility = 'internal' | 'client';

export interface ProjectFileVersion {
  id: string;
  number: number;
  original_name: string;
  content_type: string;
  size: number;
  sha256: string;
  uploaded_by: string | null;
  created_at: string;
}
export interface ProjectFile {
  id: string;
  project: string;
  category: ProjectFileCategory;
  work_item: string | null;
  delivery_review: string | null;
  title: string;
  visibility: ProjectFileVisibility;
  uploaded_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  versions: ProjectFileVersion[];
}
export interface ProjectFilePage {
  count: number;
  page: number;
  page_size: number;
  results: ProjectFile[];
}
export interface NewProjectFile {
  file: File;
  title?: string;
  category: ProjectFileCategory;
  visibility: ProjectFileVisibility;
  workItemId?: string;
}

const path = (projectId: string) => `/api/projects/${projectId}/files/`;
const fileKey = (projectId: string) => ['projects', projectId, 'files'] as const;

export function useProjectFiles(projectId: string, options: {
  category?: ProjectFileCategory | 'all';
  workItemId?: string;
  page?: number;
} = {}) {
  const { category = 'all', workItemId, page = 1 } = options;
  const qs = new URLSearchParams({ page: String(page) });
  if (category !== 'all') qs.set('category', category);
  if (workItemId) qs.set('work_item_id', workItemId);
  return useQuery({
    queryKey: [...fileKey(projectId), category, workItemId || '', page],
    queryFn: () => apiFetch<ProjectFilePage>(`${path(projectId)}?${qs}`),
    enabled: Boolean(projectId),
  });
}
function useFileInvalidation(projectId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: fileKey(projectId) });
    void qc.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
    void qc.invalidateQueries({ queryKey: ['projects', projectId, 'delivery'] });
  };
}
export function useUploadProjectFile(projectId: string) {
  const invalidate = useFileInvalidation(projectId);
  return useMutation({
    mutationFn: (payload: NewProjectFile) => {
      const form = new FormData();
      form.set('file', payload.file);
      form.set('title', payload.title || payload.file.name);
      form.set('category', payload.category);
      form.set('visibility', payload.visibility);
      if (payload.workItemId) form.set('work_item_id', payload.workItemId);
      return apiFetch<ProjectFile>(path(projectId), { method: 'POST', body: form });
    },
    onSuccess: invalidate,
  });
}
export function useUploadProjectFileVersion(projectId: string) {
  const invalidate = useFileInvalidation(projectId);
  return useMutation({
    mutationFn: ({ documentId, file }: { documentId: string; file: File }) => {
      const form = new FormData();
      form.set('file', file);
      return apiFetch<ProjectFileVersion>(
        `${path(projectId)}${documentId}/versions/`,
        { method: 'POST', body: form },
      );
    },
    onSuccess: invalidate,
  });
}
export function useUpdateProjectFile(projectId: string) {
  const invalidate = useFileInvalidation(projectId);
  return useMutation({
    mutationFn: ({ documentId, changes }: {
      documentId: string;
      changes: { title?: string; visibility?: ProjectFileVisibility };
    }) => apiFetch<ProjectFile>(`${path(projectId)}${documentId}/`, {
      method: 'PATCH', body: JSON.stringify(changes),
    }),
    onSuccess: invalidate,
  });
}
export function useArchiveProjectFile(projectId: string) {
  const invalidate = useFileInvalidation(projectId);
  return useMutation({
    mutationFn: (documentId: string) => apiFetch<void>(
      `${path(projectId)}${documentId}/`, { method: 'DELETE' },
    ),
    onSuccess: invalidate,
  });
}
export function getProjectFileVersion(projectId: string, documentId: string, versionId: string, preview = false) {
  return apiFetchBlob(`${path(projectId)}${documentId}/versions/${versionId}/download/${preview ? '?preview=1' : ''}`);
}
