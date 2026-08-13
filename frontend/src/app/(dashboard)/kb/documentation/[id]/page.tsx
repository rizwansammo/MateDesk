'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Folder, FileText, ChevronRight, ChevronDown, CheckCircle2, Clock, Share2, FileDown, ArrowLeft, Loader2, Save, Edit2, AlertTriangle, LayoutTemplate, RotateCcw, History, X } from 'lucide-react';
import { useKBArticle, useUpdateKBArticle, useKBFolders, useKBTags, useKBVersions, fetchKBVersion, useRestoreKBVersion, type KBArticleVersion } from '@/hooks/useKB';
import { useClientOrgs } from '@/hooks/useClientOrgs';
import TipTapEditor from '@/components/kb/TipTapEditor';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface DocTemplate { name: string; desc: string; docType: string; html: string; }

const DOC_TEMPLATES: DocTemplate[] = [
  {
    name: 'SOP', desc: 'Standard Operating Procedure', docType: 'SOP',
    html: `<h1>Standard Operating Procedure</h1><h2>Purpose</h2><p>Describe what this procedure achieves and when to use it.</p><h2>Scope</h2><p>Who and what this applies to.</p><h2>Prerequisites</h2><ul><li>Required access</li><li>Required tools</li></ul><h2>Procedure</h2><ol><li>First step</li><li>Second step</li><li>Third step</li></ol><h2>Verification</h2><p>How to confirm the procedure succeeded.</p><h2>Rollback</h2><p>How to undo the change if something goes wrong.</p>`,
  },
  {
    name: 'Troubleshooting Guide', desc: 'Symptom → cause → fix', docType: 'Troubleshooting Guide',
    html: `<h1>Troubleshooting Guide</h1><h2>Symptom</h2><p>What the user reports or observes.</p><h2>Likely Causes</h2><ul><li>Cause one</li><li>Cause two</li></ul><h2>Diagnosis</h2><ol><li>First check</li><li>Second check</li></ol><h2>Resolution</h2><ol><li>Fix step</li></ol><div data-callout data-type="warning" style="border-left:3px solid #f59e0b;background:rgba(245,158,11,0.10);padding:12px 16px;border-radius:4px;margin:12px 0"><p>Note any risk before applying the fix.</p></div><h2>If Unresolved</h2><p>Escalation path and who to contact.</p>`,
  },
  {
    name: 'Onboarding Checklist', desc: 'New user / device setup', docType: 'Onboarding Checklist',
    html: `<h1>Onboarding Checklist</h1><h2>Accounts</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false">Create user account</li><li data-type="taskItem" data-checked="false">Assign licenses</li><li data-type="taskItem" data-checked="false">Add to security groups</li></ul><h2>Device</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false">Enroll device in RMM</li><li data-type="taskItem" data-checked="false">Install standard software</li><li data-type="taskItem" data-checked="false">Apply security policy</li></ul><h2>Handover</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false">Share credentials securely</li><li data-type="taskItem" data-checked="false">Confirm access with user</li></ul>`,
  },
  {
    name: 'Network Documentation', desc: 'Site network reference', docType: 'Network Documentation',
    html: `<h1>Network Documentation</h1><h2>Overview</h2><p>Site name, location, and summary.</p><h2>Internet / WAN</h2><table><tr><th>Item</th><th>Detail</th></tr><tr><td>ISP</td><td></td></tr><tr><td>Public IP</td><td></td></tr><tr><td>Bandwidth</td><td></td></tr></table><h2>Equipment</h2><table><tr><th>Device</th><th>Model</th><th>IP</th><th>Location</th></tr><tr><td>Firewall</td><td></td><td></td><td></td></tr><tr><td>Switch</td><td></td><td></td><td></td></tr></table><h2>VLANs / Subnets</h2><table><tr><th>VLAN</th><th>Subnet</th><th>Purpose</th></tr><tr><td></td><td></td><td></td></tr></table>`,
  },
  {
    name: 'FAQ', desc: 'Question & answer list', docType: 'FAQ',
    html: `<h1>Frequently Asked Questions</h1><h3>Question one?</h3><p>Answer one.</p><h3>Question two?</h3><p>Answer two.</p><h3>Question three?</h3><p>Answer three.</p>`,
  },
];

export default function DocumentEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const { data: article, isLoading: isArticleLoading } = useKBArticle(id as string);
  const { data: folders = [] } = useKBFolders();
  const { data: orgs = [] } = useClientOrgs();
  const updateArticle = useUpdateKBArticle();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('published');
  const [visibility, setVisibility] = useState('internal');
  const [docType, setDocType] = useState('Article');
  const [orgId, setOrgId] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Separate timers so typing in the title can't cancel a pending content save
  const contentSaveTimeoutRef = useRef<any>(null);
  const titleSaveTimeoutRef = useRef<any>(null);
  const loadedArticleIdRef = useRef<string | null>(null);

  // Always-fresh copy of the form state, so delayed saves never send stale values
  const stateRef = useRef({ title, content, status, visibility, docType, orgId });
  stateRef.current = { title, content, status, visibility, docType, orgId };

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditing(true);
      router.replace(`/kb/documentation/${id}`);
    }
  }, [searchParams, id, router]);

  // Seed local state from the server document. While actively editing, the
  // editor is the source of truth — never overwrite it from cache updates
  // (that is what caused cursor jumps / lost keystrokes during autosave).
  useEffect(() => {
    if (!article) return;
    if (loadedArticleIdRef.current === article.id && isEditing) return;
    loadedArticleIdRef.current = article.id;
    setTitle(article.title);
    setContent(article.content || '');
    setStatus(article.status);
    setVisibility(article.visibility);
    setDocType(article.document_type || 'Article');
    setOrgId(article.client_org_id || '');
  }, [article, isEditing]);

  const handleSave = async (overrides: any = {}) => {
    setIsSaving(true);
    const current = stateRef.current;
    const dataToSave = {
      title: overrides.title ?? current.title,
      content: overrides.content ?? current.content,
      status: overrides.status ?? current.status,
      visibility: overrides.visibility ?? current.visibility,
      document_type: overrides.docType ?? current.docType,
      client_org_id: overrides.orgId !== undefined ? (overrides.orgId || null) : (current.orgId || null),
      ...(overrides.snapshot ? { create_version: true } : {}),
    };

    try {
      await updateArticle.mutateAsync({ id: id as string, data: dataToSave });
      setLastSaved(new Date());
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const triggerAutosave = (newContent: string) => {
    setContent(newContent);
    if (contentSaveTimeoutRef.current) clearTimeout(contentSaveTimeoutRef.current);
    contentSaveTimeoutRef.current = setTimeout(() => {
      contentSaveTimeoutRef.current = null;
      handleSaveRef.current({ content: newContent });
    }, 2000);
  };

  // Flush any pending save when leaving the page so the last edits aren't lost
  useEffect(() => {
    return () => {
      const hadPending = contentSaveTimeoutRef.current || titleSaveTimeoutRef.current;
      if (contentSaveTimeoutRef.current) clearTimeout(contentSaveTimeoutRef.current);
      if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
      if (hadPending) void handleSaveRef.current({});
    };
  }, []);

  const breadcrumbs = useMemo(() => {
    let crumbs = [];
    if (article?.folder_id) {
      let curr = folders.find(f => f.id === article.folder_id);
      while (curr) {
        crumbs.unshift(curr);
        curr = folders.find(f => f.id === curr!.parent_id);
      }
    }
    return crumbs;
  }, [folders, article]);

  // Document outline — parse H1/H2/H3 from the live content, in document order.
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const outline = useMemo(() => {
    if (typeof window === 'undefined' || !content) return [];
    const doc = new DOMParser().parseFromString(content, 'text/html');
    return Array.from(doc.querySelectorAll('h1, h2, h3')).map((el, index) => ({
      index,
      level: Number(el.tagName.slice(1)),
      text: (el.textContent || '').trim(),
    }));
  }, [content]);

  const scrollToHeading = (index: number) => {
    const headings = editorWrapRef.current?.querySelectorAll('h1, h2, h3');
    headings?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Word count + reading time, derived from the live content.
  const stats = useMemo(() => {
    if (typeof window === 'undefined') return { words: 0, minutes: 0 };
    const text = (new DOMParser().parseFromString(content || '', 'text/html').body.textContent || '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    return { words, minutes: words ? Math.max(1, Math.ceil(words / 200)) : 0 };
  }, [content]);

  const applyTemplate = (tpl: DocTemplate) => {
    const existingText =
      typeof window !== 'undefined'
        ? (new DOMParser().parseFromString(content || '', 'text/html').body.textContent || '').trim()
        : (content || '').trim();
    const newContent = existingText ? content + tpl.html : tpl.html;
    setContent(newContent);
    if (tpl.docType) setDocType(tpl.docType);
    setIsTemplateModalOpen(false);
    handleSaveRef.current({ content: newContent, docType: tpl.docType || docType });
  };

  // ── Version history ──────────────────────────────────────────────
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<KBArticleVersion | null>(null);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const { data: versions = [], isLoading: versionsLoading } = useKBVersions(id as string, isVersionPanelOpen);
  const restoreVersion = useRestoreKBVersion();

  const openVersionPanel = () => { setSelectedVersion(null); setIsVersionPanelOpen(true); };

  const previewVersion = async (versionId: string) => {
    setIsLoadingVersion(true);
    try {
      const full = await fetchKBVersion(id as string, versionId);
      setSelectedVersion(full);
    } catch {
      setAlertMessage('Could not load that version.');
    } finally {
      setIsLoadingVersion(false);
    }
  };

  const doRestore = async () => {
    if (!selectedVersion) return;
    setIsRestoring(true);
    try {
      const updated = await restoreVersion.mutateAsync({ articleId: id as string, versionId: selectedVersion.id });
      setTitle(updated.title);
      setContent(updated.content || '');
      setLastSaved(new Date());
      setIsVersionPanelOpen(false);
      setSelectedVersion(null);
    } catch {
      setAlertMessage('Restore failed. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  // ── Export to PDF (browser print → Save as PDF; renders all rich content) ──
  const exportPdf = () => {
    const styles = `
      @page { margin: 22mm 16mm; }
      * { box-sizing: border-box; }
      body { font-family: Inter, Arial, sans-serif; color: #111; font-size: 13px; line-height: 1.6; }
      h1.kb-doc-title { font-size: 26px; margin: 0 0 4px; }
      .kb-doc-meta { color: #666; font-size: 11px; margin: 0 0 18px; border-bottom: 1px solid #ddd; padding-bottom: 12px; }
      h1 { font-size: 22px; margin: 18px 0 8px; } h2 { font-size: 18px; margin: 16px 0 6px; } h3 { font-size: 15px; margin: 14px 0 6px; }
      p { margin: 8px 0; } ul, ol { margin: 8px 0; padding-left: 22px; }
      img { max-width: 100%; } a { color: #1f4ed8; text-decoration: underline; }
      table { border-collapse: collapse; width: 100%; margin: 10px 0; } th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; } th { background: #f1f5f9; }
      blockquote { border-left: 3px solid #cbd5e1; margin: 10px 0; padding: 4px 14px; color: #444; }
      pre { background: #0d1117; color: #e6edf3; padding: 12px 14px; border-radius: 6px; overflow-x: auto; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
      pre code { background: none; color: inherit; } code { font-family: 'Courier New', monospace; }
      pre, table, img, blockquote, [data-callout] { page-break-inside: avoid; }
      .hljs-comment,.hljs-quote{color:#8b949e;font-style:italic}
      .hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name,.hljs-tag{color:#cf222e}
      .hljs-string,.hljs-attr,.hljs-addition{color:#0a7d33}
      .hljs-number,.hljs-literal,.hljs-type,.hljs-meta{color:#0550ae}
      .hljs-title,.hljs-function .hljs-title{color:#6639ba}
      .hljs-attribute,.hljs-variable{color:#953800}
    `;
    const created = article ? new Date(article.created_at).toLocaleDateString() : '';
    const meta = [article?.author_name, created].filter(Boolean).join(' · ');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Document')}</title><style>${styles}</style></head><body><h1 class="kb-doc-title">${escapeHtml(title || 'Untitled Document')}</h1><div class="kb-doc-meta">${escapeHtml(meta)}</div><div class="kb-doc-body">${content}</div></body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { iframe.remove(); return; }
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 400);
  };

  if (isArticleLoading) {
    return <div className="flex h-full items-center justify-center bg-[var(--bg-deep)]"><Loader2 className="animate-spin text-blue-500" /></div>;
  }

  if (!article) return <div className="flex h-full items-center justify-center bg-[var(--bg-deep)] text-[var(--text-1)]">Document not found</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-deep)]">
      {isVersionPanelOpen && (
        <>
          <div
            onClick={() => setIsVersionPanelOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 8900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', zIndex: 8901, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(900px, 94vw)', height: 'min(620px, 88vh)', background: 'var(--bg-deep)',
            border: '1px solid var(--border-panel)', borderTop: '2px solid #3b82f6',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={16} className="text-blue-400" /> Version History
              </span>
              <button onClick={() => setIsVersionPanelOpen(false)} className="icon-btn"><X size={16} /></button>
            </div>
            <div className="flex flex-1 min-h-0">
              {/* Version list */}
              <div className="w-[280px] flex-shrink-0 border-r border-[var(--border-subtle)] overflow-y-auto custom-scrollbar">
                {versionsLoading ? (
                  <div className="p-4 text-[12px] text-[var(--text-3)]">Loading…</div>
                ) : versions.length === 0 ? (
                  <div className="p-4 text-[12px] text-[var(--text-3)]">No history yet. Snapshots are saved automatically as you edit.</div>
                ) : (
                  versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => previewVersion(v.id)}
                      className="w-full text-left px-3 py-2.5 border-b border-[var(--border-subtle)]"
                      style={{ background: selectedVersion?.id === v.id ? 'var(--bg-surface)' : 'transparent' }}
                    >
                      <div className="text-[12px] text-[var(--text-1)]">{new Date(v.created_at).toLocaleString()}</div>
                      <div className="text-[11px] text-[var(--text-3)] truncate">{v.created_by_name || 'Unknown'} · {v.title || 'Untitled'}</div>
                      {v.preview && <div className="text-[11px] text-[var(--text-4)] truncate mt-0.5">{v.preview}</div>}
                    </button>
                  ))
                )}
              </div>
              {/* Preview */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  {isLoadingVersion ? (
                    <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-blue-500" /></div>
                  ) : selectedVersion ? (
                    <>
                      <h1 className="text-[24px] font-bold text-[var(--text-1)] mb-4">{selectedVersion.title || 'Untitled'}</h1>
                      <div className="prose prose-sm max-w-none text-[var(--text-1)]" dangerouslySetInnerHTML={{ __html: selectedVersion.content || '' }} />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[13px] text-[var(--text-3)]">Select a version on the left to preview it.</div>
                  )}
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-[11px] text-[var(--text-3)]">Restoring keeps your current version in history too.</span>
                  <button onClick={doRestore} disabled={!selectedVersion || isRestoring} className="btn-primary py-1" style={{ opacity: !selectedVersion || isRestoring ? 0.6 : 1 }}>
                    <RotateCcw size={14} /> {isRestoring ? 'Restoring…' : 'Restore this version'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {isTemplateModalOpen && (
        <>
          <div
            onClick={() => setIsTemplateModalOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 8900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', zIndex: 8901, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(560px, 92vw)', background: 'var(--bg-deep)', border: '1px solid var(--border-panel)',
            borderTop: '2px solid #3b82f6', boxShadow: '0 24px 80px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <LayoutTemplate size={16} className="text-blue-400" /> Insert a template
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {DOC_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="text-left p-3 rounded transition-colors"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="text-[13px] font-semibold text-[var(--text-1)]">{tpl.name}</div>
                  <div className="text-[12px] text-[var(--text-3)] mt-0.5">{tpl.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <span className="text-[11px] text-[var(--text-3)]">Added to the end of the document.</span>
              <button onClick={() => setIsTemplateModalOpen(false)} className="btn-secondary py-1">Cancel</button>
            </div>
          </div>
        </>
      )}

      {alertMessage && (
        <>
          <div 
            onClick={() => setAlertMessage(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 8900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} 
          />
          <div style={{
            position: 'fixed', zIndex: 8901, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 360, background: 'var(--bg-deep)', border: '1px solid var(--border-panel)',
            borderTop: '2px solid #3b82f6', borderRadius: 0, boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-1)' }}>
              Notice
            </div>
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-2)' }}>
              {alertMessage}
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <button onClick={() => setAlertMessage(null)} className="btn-primary">OK</button>
            </div>
          </div>
        </>
      )}

      {/* Secondary Topbar */}
      <div className="secondary-bar flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/kb/documentation')} className="icon-btn" title="Back to Documentation">
            <ArrowLeft size={16} />
          </button>
          <BookOpen size={13} style={{ color: 'var(--accent-violet-fg)' }} />
          <span className="text-[12px] font-bold text-[var(--text-1)]">Knowledge Base</span>
          <span className="text-[12px] text-[var(--text-3)]">/</span>
          {breadcrumbs.length === 0 ? (
            <span className="text-[12px] text-[var(--text-2)] cursor-pointer hover:text-[var(--text-1)]" onClick={() => router.push('/kb/documentation')}>Root Space</span>
          ) : (
            breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                <span className="text-[12px] text-[var(--text-2)] cursor-pointer hover:text-[var(--text-1)] truncate max-w-[100px]">{crumb.name}</span>
                {idx < breadcrumbs.length - 1 && <span className="text-[12px] text-[var(--text-3)]">/</span>}
              </React.Fragment>
            ))
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-2)]">
            {isSaving ? (
              <><Loader2 size={12} className="animate-spin" /> Saving...</>
            ) : saveError ? (
              <><AlertTriangle size={12} className="text-red-400" /> <span className="text-red-400">Save failed — keeps your text, retries on next change</span></>
            ) : lastSaved ? (
              <><CheckCircle2 size={12} className="text-green-500" /> Saved</>
            ) : null}
          </div>
          {isEditing && (
            <button className="btn-secondary py-1" onClick={() => setIsTemplateModalOpen(true)}>
              <LayoutTemplate size={14} /> Templates
            </button>
          )}
          {isEditing ? (
            <button className="btn-primary py-1" onClick={() => { handleSave({ snapshot: true }); setIsEditing(false); }}>
              Done Editing
            </button>
          ) : (
            <button className="btn-primary py-1" onClick={() => setIsEditing(true)}>
              <Edit2 size={14} /> Edit Document
            </button>
          )}
          <button className="btn-secondary py-1" onClick={exportPdf}>
            <FileDown size={14} /> Export PDF
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[260px] flex-shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col">
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <span className="text-[11px] font-bold text-[var(--text-3)] tracking-wider uppercase">Current Location</span>
            <div className="mt-2 flex items-center gap-2 text-[13px] text-[var(--text-1)]">
              <Folder size={14} className="text-blue-400" />
              <span className="truncate">{breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length-1].name : 'Root Space'}</span>
            </div>
          </div>
          <div className="p-3 border-b border-[var(--border-subtle)] flex-1 overflow-y-auto custom-scrollbar">
            <span className="text-[11px] font-bold text-[var(--text-3)] tracking-wider uppercase">Document Outline</span>
            {outline.length === 0 ? (
              <div className="mt-2 text-[12px] text-[var(--text-2)] italic">
                Headings (H1/H2/H3) you add will appear here.
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-0.5">
                {outline.map((h) => (
                  <button
                    key={h.index}
                    onClick={() => scrollToHeading(h.index)}
                    title={h.text || 'Untitled heading'}
                    className="text-left text-[12px] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-surface)] rounded px-1.5 py-1 truncate transition-colors"
                    style={{ paddingLeft: 6 + (h.level - 1) * 12 }}
                  >
                    {h.text || 'Untitled heading'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 flex flex-col bg-[var(--bg-deep)] overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 lg:px-20 xl:px-40 py-10 custom-scrollbar">
            {isEditing ? (
              <input 
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
                  titleSaveTimeoutRef.current = setTimeout(() => {
                    titleSaveTimeoutRef.current = null;
                    handleSaveRef.current({ title: e.target.value });
                  }, 1500);
                }}
                placeholder="Document Title..."
                className="w-full bg-transparent text-[32px] font-bold text-[var(--text-1)] mb-6 outline-none placeholder-[var(--text-3)]"
              />
            ) : (
              <h1 className="text-[32px] font-bold text-[var(--text-1)] mb-6">{title || 'Untitled Document'}</h1>
            )}
            
            <div className="min-h-[500px]" ref={editorWrapRef}>
               <TipTapEditor content={content} onChange={triggerAutosave} readOnly={!isEditing} />
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-3 px-4 lg:px-20 xl:px-40 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
            <span>{stats.words.toLocaleString()} {stats.words === 1 ? 'word' : 'words'}</span>
            {stats.minutes > 0 && (<><span className="text-[var(--text-4)]">·</span><span>{stats.minutes} min read</span></>)}
          </div>
        </div>

        {/* Right Panel: Properties */}
        <div className="w-[280px] flex-shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <span className="text-[13px] font-semibold text-[var(--text-1)]">Document Properties</span>
          </div>
          
          <div className="p-4 flex flex-col gap-5">
            <div>
              <label className="label">Status</label>
              <select className="select w-full" value={status} onChange={(e) => { setStatus(e.target.value); handleSave({ status: e.target.value }); }}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="label">Visibility</label>
              <select className="select w-full" value={visibility} onChange={(e) => { setVisibility(e.target.value); handleSave({ visibility: e.target.value }); }}>
                <option value="internal">Internal (MSP Only)</option>
                <option value="public">Public (Client Visible)</option>
              </select>
            </div>

            <div>
              <label className="label">Client Organization</label>
              <select className="select w-full" value={orgId} onChange={(e) => { setOrgId(e.target.value); handleSave({ orgId: e.target.value }); }}>
                <option value="">-- All Organizations (Global) --</option>
                {orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Document Type</label>
              <select className="select w-full" value={docType} onChange={(e) => { setDocType(e.target.value); handleSave({ docType: e.target.value }); }}>
                <option value="Article">Article</option>
                <option value="SOP">SOP</option>
                <option value="Troubleshooting Guide">Troubleshooting Guide</option>
                <option value="Onboarding Checklist">Onboarding Checklist</option>
                <option value="Offboarding Checklist">Offboarding Checklist</option>
                <option value="Network Documentation">Network Documentation</option>
                <option value="FAQ">FAQ</option>
                <option value="Policy">Policy</option>
                <option value="Internal Note">Internal Note</option>
              </select>
            </div>
            
            <div className="border-t border-[var(--border-subtle)] pt-4 mt-2">
               <label className="label">Tags</label>
               <div className="text-[12px] text-[var(--text-2)]">Tags input coming soon...</div>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-4 mt-2">
              <span className="text-[11px] font-bold text-[var(--text-3)] tracking-wider uppercase block mb-3">Meta Info</span>
              <div className="flex flex-col gap-2 text-[12px] text-[var(--text-2)]">
                <div className="flex justify-between">
                  <span>Author:</span>
                  <span className="text-[var(--text-1)]">{article.author_name || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="text-[var(--text-1)]">{new Date(article.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Updated:</span>
                  <span className="text-[var(--text-1)]">{new Date(article.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <button className="btn-secondary justify-center w-full mt-4" onClick={openVersionPanel}>
              <Clock size={14} /> Version History
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
