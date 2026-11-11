'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive, ChevronLeft, ChevronRight, Download, Eye, FilePlus2,
  FolderOpen, History, Paperclip, UploadCloud, X,
} from 'lucide-react';
import type { Project } from '@/types/projects';
import { useAuthStore } from '@/store/useAuthStore';
import {
  type ProjectFile, type ProjectFileCategory, type ProjectFileVersion,
  type ProjectFileVisibility, getProjectFileVersion,
  useArchiveProjectFile, useProjectFiles, useUpdateProjectFile,
  useUploadProjectFile, useUploadProjectFileVersion,
} from '@/hooks/useProjectFiles';

type Category = ProjectFileCategory | 'all';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1048576).toFixed(1)} MB`;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
function canPreview(filename: string): boolean {
  return /\.(pdf|png|jpe?g|webp)$/i.test(filename);
}

export function ProjectFilesPanel({ project, category = 'all', workItemId, uploadLocked = false }: {
  project: Project;
  category?: Category;
  workItemId?: string;
  uploadLocked?: boolean;
}) {
  const [filter, setFilter] = useState<Category>('all');
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<ProjectFileVisibility>('internal');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; isPdf: boolean } | null>(null);
  const [localError, setLocalError] = useState('');
  const effectiveCategory = category === 'all' ? filter : category;
  const uploadCategory: ProjectFileCategory = category === 'delivery' ? 'delivery' : category === 'work_item' ? 'work_item' : 'library';
  const isClient = project.my_role === 'client_reviewer';
  const currentUserId = useAuthStore(state => state.user?.id);
  const canUpload = (project.can_edit || isClient) && !['completed', 'archived'].includes(project.status)
    && !uploadLocked && (category !== 'delivery' || project.can_manage);
  const canManageFiles = project.can_manage && !['completed', 'archived'].includes(project.status) && !uploadLocked;
  const files = useProjectFiles(project.id, { category: effectiveCategory, workItemId, page });
  const upload = useUploadProjectFile(project.id);
  const newVersion = useUploadProjectFileVersion(project.id);
  const update = useUpdateProjectFile(project.id);
  const archive = useArchiveProjectFile(project.id);
  const list = files.data?.results || [];
  const pageCount = Math.max(1, Math.ceil((files.data?.count || 0) / 50));

  useEffect(() => {
    return () => { if (preview?.url) URL.revokeObjectURL(preview.url); };
  }, [preview]);

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !canUpload) return;
    if (file.size > 20 * 1024 * 1024) {
      setLocalError('Maximum file size is 20 MB.');
      return;
    }
    setLocalError('');
    try {
      await upload.mutateAsync({
        file, title: title.trim() || file.name,
        category: uploadCategory,
        visibility: isClient || uploadCategory === 'delivery' ? 'client' : visibility,
        ...(workItemId ? { workItemId } : {}),
      });
      setFile(null);
      setTitle('');
      setPage(1);
      const input = document.getElementById(`project-file-upload-${project.id}-${uploadCategory}`) as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  async function uploadRevision(documentId: string, next: File | undefined) {
    if (!next) return;
    setLocalError('');
    if (next.size > 20 * 1024 * 1024) {
      setLocalError('Maximum file size is 20 MB.');
      return;
    }
    try {
      await newVersion.mutateAsync({ documentId, file: next });
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  async function openVersion(doc: ProjectFile, version: ProjectFileVersion, inline: boolean) {
    setLocalError('');
    try {
      const result = await getProjectFileVersion(project.id, doc.id, version.id, inline);
      const url = URL.createObjectURL(result.blob);
      if (inline && canPreview(version.original_name)) {
        setPreview({
          url, name: version.original_name,
          isPdf: version.original_name.toLowerCase().endsWith('.pdf'),
        });
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename || version.original_name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  async function changeDocumentVisibility(doc: ProjectFile, next: ProjectFileVisibility) {
    setLocalError('');
    try { await update.mutateAsync({ documentId: doc.id, changes: { visibility: next } }); }
    catch (error) { setLocalError(errorMessage(error)); }
  }

  async function archiveFile(doc: ProjectFile) {
    if (!window.confirm(`Archive ${doc.title}? File versions will remain in the audit history but will no longer appear in the library.`)) return;
    setLocalError('');
    try { await archive.mutateAsync(doc.id); }
    catch (error) { setLocalError(errorMessage(error)); }
  }

  return (
    <section className="panel w-full min-w-0 p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {category === 'work_item' ? <Paperclip size={16} /> : <FolderOpen size={16} />}
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
            {category === 'delivery' ? 'Delivery Files' : category === 'work_item' ? 'Attachments' : 'Project Files'}
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {files.data?.count ?? 0}
          </span>
        </div>
        {category === 'all' && (
          <select className="select text-xs" aria-label="Filter project files" value={filter}
            onChange={event => { setFilter(event.target.value as Category); setPage(1); }}>
            <option value="all">All Files</option>
            <option value="library">Project Library</option>
            <option value="work_item">Work Item Attachments</option>
            <option value="delivery">Delivery Files</option>
          </select>
        )}
      </div>

      {canUpload && (
        <form onSubmit={uploadFile} className="mb-4 flex flex-wrap items-end gap-2 border p-3"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div className="min-w-[180px] flex-1">
            <label className="label" htmlFor={`project-file-upload-${project.id}-${uploadCategory}`}>Choose file (max 20 MB)</label>
            <input id={`project-file-upload-${project.id}-${uploadCategory}`} type="file" className="input w-full text-xs"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.json,.docx,.xlsx,.pptx,.zip"
              onChange={event => {
                const chosen = event.target.files?.[0] || null;
                setFile(chosen); setTitle(chosen?.name || '');
              }} />
          </div>
          <div className="min-w-[155px] flex-1">
            <label className="label" htmlFor={`project-file-title-${project.id}-${uploadCategory}`}>Display Name</label>
            <input id={`project-file-title-${project.id}-${uploadCategory}`} value={title}
              maxLength={255} className="input w-full text-xs" placeholder="File name"
              onChange={event => setTitle(event.target.value)} />
          </div>
          {!isClient && uploadCategory !== 'delivery' && project.can_manage && (
            <div>
              <label className="label" htmlFor={`project-file-vis-${project.id}-${uploadCategory}`}>Visibility</label>
              <select id={`project-file-vis-${project.id}-${uploadCategory}`}
                className="select text-xs" value={visibility}
                onChange={event => setVisibility(event.target.value as ProjectFileVisibility)}>
                <option value="internal">Internal</option>
                <option value="client">Client Visible</option>
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary inline-flex items-center gap-1.5 text-xs"
            disabled={!file || upload.isPending}>
            <UploadCloud size={13} /> {upload.isPending ? 'Uploading…' : 'Upload File'}
          </button>
        </form>
      )}

      {localError && <p role="alert" className="mb-3 text-xs" style={{ color: 'var(--accent-danger-fg)' }}>{localError}</p>}
      {files.isError && <p role="alert" className="mb-3 text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
        {errorMessage(files.error)}
        <button className="btn-secondary ml-2" type="button" onClick={() => { void files.refetch(); }}>Retry</button>
      </p>}
      {files.isLoading && <p className="py-5 text-center text-xs" style={{ color: 'var(--text-3)' }}>Loading files…</p>}
      {!files.isLoading && !files.isError && list.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center" style={{ color: 'var(--text-3)' }}>
          <FilePlus2 size={25}/>
          <p className="text-xs">{category === 'delivery' ? 'No delivery files yet.' : 'No files uploaded yet.'}</p>
        </div>
      )}
      {list.length > 0 && (
        <div className="min-w-0 overflow-x-auto">
          <table className="data-table w-full">
            <thead><tr><th>File</th><th>Location</th><th>Visibility</th><th>Version</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {list.map(doc => {
                const latest = doc.versions[0];
                const frozen = Boolean(doc.delivery_review);
                return (
                  <tr key={doc.id}>
                    <td className="min-w-[160px]">
                      <div className="max-w-[360px] truncate text-xs font-semibold" title={doc.title}
                        style={{ color: 'var(--text-0)' }}>{doc.title}</div>
                      <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {latest ? formatBytes(latest.size) : 'No version'} · {doc.uploaded_by || 'Unknown'}
                      </div>
                      {expanded === doc.id && (
                        <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
                          {doc.versions.map(ver => (
                            <div key={ver.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span>v{ver.number}</span>
                              <span className="max-w-[150px] truncate" title={ver.original_name}>{ver.original_name}</span>
                              <span style={{ color: 'var(--text-3)' }}>{formatBytes(ver.size)}</span>
                              <button type="button" aria-label={`Download version ${ver.number}`}
                                onClick={() => { void openVersion(doc, ver, false); }}
                                style={{ color: 'var(--accent-info-fg)' }}>Download</button>
                              {canPreview(ver.original_name) && (
                                <button type="button" aria-label={`Preview version ${ver.number}`}
                                  onClick={() => { void openVersion(doc, ver, true); }}
                                  style={{ color: 'var(--accent-info-fg)' }}>Preview</button>
                              )}
                            </div>
                          ))}
                          {canUpload && !frozen && (
                            !isClient || doc.created_by === currentUserId
                          ) && (
                            <label className="inline-flex cursor-pointer items-center gap-1 pt-1 text-[11px]"
                              style={{ color: 'var(--accent-info-fg)' }}>
                              <FilePlus2 size={12} /> Upload new version
                              <input type="file" className="sr-only"
                                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.json,.docx,.xlsx,.pptx,.zip"
                                disabled={newVersion.isPending}
                                onChange={event => { void uploadRevision(doc.id, event.target.files?.[0]); event.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">{doc.category === 'library' ? 'Library' : doc.category === 'work_item' ? 'Work Item' : 'Delivery'}</td>
                    <td>
                      {canManageFiles && !frozen && doc.category !== 'delivery'
                        ? <select className="select text-[11px]" value={doc.visibility} aria-label={`Visibility for ${doc.title}`}
                            disabled={update.isPending}
                            onChange={event => { void changeDocumentVisibility(doc, event.target.value as ProjectFileVisibility); }}>
                            <option value="internal">Internal</option><option value="client">Client Visible</option>
                          </select>
                        : <span className="text-[11px]">{doc.visibility === 'client' ? 'Client Visible' : 'Internal'}</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs">v{latest?.number ?? 0}</td>
                    <td className="whitespace-nowrap text-[11px]">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {latest && (
                          <>
                            <button type="button" title="Download" aria-label={`Download ${doc.title}`}
                              onClick={() => { void openVersion(doc, latest, false); }}><Download size={14}/></button>
                            {canPreview(latest.original_name) &&
                              <button type="button" title="Preview" aria-label={`Preview ${doc.title}`}
                                onClick={() => { void openVersion(doc, latest, true); }}><Eye size={14}/></button>}
                          </>
                        )}
                        <button type="button" title="Version History" aria-label={`Version history for ${doc.title}`}
                          onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}><History size={14}/></button>
                        {canManageFiles && !frozen && (
                          <button type="button" title="Archive File" aria-label={`Archive ${doc.title}`}
                            disabled={archive.isPending} onClick={() => { void archiveFile(doc); }}><Archive size={14}/></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <span>Page {page} of {pageCount} · {files.data?.count} files</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" aria-label="Previous page"
              disabled={page <= 1} onClick={() => setPage(v => Math.max(1, v - 1))}><ChevronLeft size={14}/></button>
            <button type="button" className="btn-secondary" aria-label="Next page"
              disabled={page >= pageCount} onClick={() => setPage(v => v + 1)}><ChevronRight size={14}/></button>
          </div>
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true"
          aria-label={`Preview ${preview.name}`} style={{ background: 'rgba(0,0,0,.8)' }}>
          <div className="flex h-[85vh] w-full max-w-5xl flex-col border p-3"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-md)' }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="truncate text-xs font-semibold">{preview.name}</span>
              <button type="button" aria-label="Close preview" onClick={() => setPreview(null)}><X size={18}/></button>
            </div>
            {preview.isPdf
              ? <iframe title={preview.name} src={preview.url} sandbox="" className="min-h-0 w-full flex-1"/>
              : <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                  {/* Blob URLs are created only from the authenticated download response. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview.url} alt={preview.name} className="max-h-full max-w-full object-contain"/>
                </div>}
          </div>
        </div>
      )}
    </section>
  );
}
