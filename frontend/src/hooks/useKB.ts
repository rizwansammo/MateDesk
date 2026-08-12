import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface KBLinkedTicket {
  id:  string;
  ref: string;
}

export interface KBTag {
  id: string;
  name: string;
  color: string;
}

export interface KBArticle {
  id:             string;
  category:       'resolution' | 'documentation' | 'canned_response';
  document_type:  string;
  title:          string;
  content:        string;
  status:         'draft' | 'published';
  visibility:     'internal' | 'public';
  author_name:    string | null;
  org_name:       string;
  client_org_id:  string | null;
  folder_id:      string | null;
  tags:           KBTag[];
  linked_tickets: KBLinkedTicket[];
  created_at:     string;
  updated_at:     string;
}

export interface KBFolder {
  id:         string;
  name:       string;
  parent_id:  string | null;
  created_at: string;
  updated_at: string;
}

export interface KBFolderPayload {
  name:       string;
  parent_id?: string | null;
}

export interface KBArticlePayload {
  category?:      string;
  document_type?: string;
  title?:         string;
  content?:       string;
  status?:        string;
  visibility?:    string;
  folder_id?:     string | null;
  client_org_id?: string | null;
  tags?:          string[];
  create_version?: boolean;
}

export interface KBArticleVersion {
  id:              string;
  title:           string;
  created_by_name: string | null;
  created_at:      string;
  preview?:        string;
  content?:        string;
}

export function useKBArticles(category?: string, q?: string, folder_id?: string | null) {
  return useQuery({
    queryKey: ['kb-articles', category ?? '', q ?? '', folder_id === null ? 'null' : (folder_id ?? '')],
    queryFn: () => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (q)        params.set('q', q);
      if (folder_id !== undefined) params.set('folder_id', folder_id === null ? 'null' : folder_id);
      const qs = params.toString();
      return apiFetch<KBArticle[]>(`/api/kb/articles/${qs ? `?${qs}` : ''}`);
    },
  });
}

export function useKBArticle(id: string) {
  return useQuery({
    queryKey: ['kb-article', id],
    queryFn:  () => apiFetch<KBArticle>(`/api/kb/articles/${id}/`),
    enabled:  !!id,
  });
}

export function useCreateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: KBArticlePayload) =>
      apiFetch<KBArticle>('/api/kb/articles/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb-articles'] }),
  });
}

export function useUpdateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: KBArticlePayload }) =>
      apiFetch<KBArticle>(`/api/kb/articles/${id}/`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: (updated, { id }) => {
      qc.invalidateQueries({ queryKey: ['kb-articles'] });
      // Write the response into the cache instead of refetching — a refetch
      // resets the open editor mid-typing (cursor jump / lost keystrokes)
      qc.setQueryData(['kb-article', id], (prev: KBArticle | undefined) =>
        prev ? { ...prev, ...updated } : updated
      );
    },
  });
}

export function useKBVersions(articleId: string, enabled = true) {
  return useQuery({
    queryKey: ['kb-versions', articleId],
    queryFn:  () => apiFetch<KBArticleVersion[]>(`/api/kb/articles/${articleId}/versions/`),
    enabled:  !!articleId && enabled,
  });
}

export async function fetchKBVersion(articleId: string, versionId: string) {
  return apiFetch<KBArticleVersion>(`/api/kb/articles/${articleId}/versions/${versionId}/`);
}

export function useRestoreKBVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, versionId }: { articleId: string; versionId: string }) =>
      apiFetch<KBArticle>(`/api/kb/articles/${articleId}/versions/${versionId}/restore/`, {
        method: 'POST',
        body:   '{}',
      }),
    onSuccess: (updated, { articleId }) => {
      qc.setQueryData(['kb-article', articleId], (prev: KBArticle | undefined) =>
        prev ? { ...prev, ...updated } : updated
      );
      qc.invalidateQueries({ queryKey: ['kb-versions', articleId] });
      qc.invalidateQueries({ queryKey: ['kb-articles'] });
    },
  });
}

export function useDeleteKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/kb/articles/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb-articles'] }),
  });
}

export function useLinkTicketToArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, ticketRef }: { articleId: string; ticketRef: string }) =>
      apiFetch(`/api/kb/articles/${articleId}/link-ticket/`, {
        method: 'POST',
        body:   JSON.stringify({ ticket_ref: ticketRef }),
      }),
    onSuccess: (_, { articleId }) => {
      qc.invalidateQueries({ queryKey: ['kb-article', articleId] });
    },
  });
}

export function useUnlinkTicketFromArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, ticketRef }: { articleId: string; ticketRef: string }) =>
      apiFetch(`/api/kb/articles/${articleId}/link-ticket/`, {
        method: 'DELETE',
        body:   JSON.stringify({ ticket_ref: ticketRef }),
      }),
    onSuccess: (_, { articleId, ticketRef }) => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketRef] });
      qc.invalidateQueries({ queryKey: ['kb-article', articleId] });
    },
  });
}

export function useKBFolders() {
  return useQuery({
    queryKey: ['kb-folders'],
    queryFn:  () => apiFetch<KBFolder[]>('/api/kb/folders/'),
  });
}

export function useKBTags() {
  return useQuery({
    queryKey: ['kb-tags'],
    queryFn:  () => apiFetch<KBTag[]>('/api/kb/tags/'),
  });
}

export function useCreateKBFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: KBFolderPayload) =>
      apiFetch<KBFolder>('/api/kb/folders/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb-folders'] }),
  });
}

export function useUpdateKBFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<KBFolderPayload> }) =>
      apiFetch<KBFolder>(`/api/kb/folders/${id}/`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-folders'] });
    },
  });
}

export function useDeleteKBFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/kb/folders/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb-folders'] }),
  });
}
