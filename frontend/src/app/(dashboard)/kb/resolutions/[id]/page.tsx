'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, Pencil, Check, X, Trash2,
  Ticket, Plus, BookOpen, Building2, User, Eye, Tag,
} from 'lucide-react';
import { useKBArticle, useUpdateKBArticle, useDeleteKBArticle, useLinkTicketToArticle } from '@/hooks/useKB';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useAuthStore } from '@/store/useAuthStore';

const MONO: React.CSSProperties = { fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: 'tabular-nums' };

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  published: { label: 'Published', color: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)' },
  draft:     { label: 'Draft',     color: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
};

const VIS_CFG: Record<string, { label: string; color: string }> = {
  internal: { label: 'Internal', color: 'var(--accent-indigo-fg)' },
  public:   { label: 'Public',   color: 'var(--accent-info-fg)' },
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6,
};
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 10px',
  background: 'var(--bg-base)', border: '1px solid var(--border-md)',
  color: 'var(--text-1)', fontSize: 13, outline: 'none',
};

function SidebarRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', gap: 10, minHeight: 38 }}>
      <Icon size={12} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export default function KBArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = use(params);
  const router   = useRouter();
  const { user } = useAuthStore();
  const isMSP    = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const { data: article, isLoading, isError } = useKBArticle(id);
  const { data: orgs }                        = useOrganizations();
  const updateArticle = useUpdateKBArticle();
  const deleteArticle = useDeleteKBArticle();
  const linkTicket    = useLinkTicketToArticle();

  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ title: '', content: '', status: '', visibility: '', client_org_id: '' });
  const [linkRef, setLinkRef] = useState('');
  const [linkError, setLinkError] = useState('');
  const [deleting, setDeleting]   = useState(false);

  useEffect(() => {
    if (article) {
      setForm({
        title:         article.title,
        content:       article.content,
        status:        article.status,
        visibility:    article.visibility,
        client_org_id: '',
      });
    }
  }, [article]);

  function startEdit() { setEditing(true); }
  function cancelEdit() {
    if (article) setForm({ title: article.title, content: article.content, status: article.status, visibility: article.visibility, client_org_id: '' });
    setEditing(false);
  }

  function saveEdit() {
    updateArticle.mutate(
      { id, data: { title: form.title, content: form.content, status: form.status, visibility: form.visibility } },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleLinkTicket() {
    setLinkError('');
    const ref = linkRef.trim().toUpperCase();
    if (!ref) return;
    linkTicket.mutate(
      { articleId: id, ticketRef: ref },
      {
        onSuccess: () => setLinkRef(''),
        onError:   (err: unknown) => {
          setLinkError((err instanceof Error ? err.message : null) ?? 'Ticket not found.');
        },
      }
    );
  }

  function confirmDelete() {
    deleteArticle.mutate(id, { onSuccess: () => router.push('/kb/resolutions') });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={26} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={28} style={{ color: 'var(--accent-danger-fg)' }} />
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Article not found.</p>
        <button onClick={() => router.push('/kb/resolutions')} style={{ fontSize: 12, color: 'var(--accent-info-fg)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Back to Resolutions
        </button>
      </div>
    );
  }

  const sCfg = STATUS_CFG[article.status] ?? STATUS_CFG.published;
  const vCfg = VIS_CFG[article.visibility] ?? VIS_CFG.internal;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/kb/resolutions')}
          className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Resolutions
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.title}
        </span>
        <div style={{ flex: 1 }} />
        {isMSP && !editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={startEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '3px 10px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
            >
              <Pencil size={11} /> Edit
            </button>
            <button
              onClick={() => setDeleting(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--accent-danger-fg)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', padding: '3px 10px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'; }}
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={saveEdit}
              disabled={updateArticle.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', padding: '3px 12px', cursor: 'pointer', opacity: updateArticle.isPending ? 0.6 : 1 }}
            >
              {updateArticle.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Save
            </button>
            <button
              onClick={cancelEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', padding: '3px 10px', cursor: 'pointer' }}
            >
              <X size={11} /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* Left: content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Title */}
            {editing ? (
              <div>
                <label style={LABEL_STYLE}>Title</label>
                <input
                  type="text"
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>
            ) : (
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.3 }}>{article.title}</h1>
            )}

            {/* Content */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={12} style={{ color: 'var(--accent-violet-fg)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-violet-fg)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Content</span>
              </div>
              {editing ? (
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  style={{
                    width: '100%', minHeight: 320, padding: '14px',
                    background: 'var(--bg-base)', border: 'none',
                    color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical', display: 'block', lineHeight: 1.7,
                  }}
                />
              ) : (
                <div style={{ padding: '16px 18px', minHeight: 160 }}>
                  {article.content ? (
                    <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                      {article.content}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>No content yet.</div>
                  )}
                </div>
              )}
            </div>

            {/* Linked Tickets */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ticket size={12} style={{ color: 'var(--accent-info-fg)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-info-fg)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Linked Tickets
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-elevated)', padding: '1px 6px', marginLeft: 2 }}>
                  {article.linked_tickets.length}
                </span>
              </div>

              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {article.linked_tickets.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No tickets linked yet.</p>
                ) : (
                  article.linked_tickets.map(t => (
                    <Link
                      key={t.id}
                      href={`/requests/${t.ref}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-info-fg)', fontWeight: 600, textDecoration: 'none', ...MONO }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#93c5fd'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#60a5fa'; }}
                    >
                      <Ticket size={12} /> {t.ref}
                    </Link>
                  ))
                )}

                {/* Link a ticket */}
                {isMSP && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Ticket ref e.g. T17052026-0001"
                        value={linkRef}
                        onChange={e => { setLinkRef(e.target.value); setLinkError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleLinkTicket(); }}
                        style={{ height: 32, flex: 1, maxWidth: 280, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', ...MONO }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                      />
                      <button
                        onClick={handleLinkTicket}
                        disabled={!linkRef.trim() || linkTicket.isPending}
                        style={{ height: 32, padding: '0 12px', background: linkRef.trim() ? '#2563eb' : 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: linkRef.trim() ? '#fff' : 'var(--text-4)', fontSize: 12, fontWeight: 600, cursor: linkRef.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {linkTicket.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Link
                      </button>
                    </div>
                    {linkError && (
                      <p style={{ fontSize: 11, color: 'var(--accent-danger-fg)', marginTop: 4 }}>{linkError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Right: properties sidebar */}
        <div style={{ width: 240, flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-md)' }}>
            <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Properties</span>
          </div>

          <SidebarRow icon={Tag} label="Status">
            {editing ? (
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', height: 28, padding: '0 6px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
              >
                <option value="published" style={{ background: 'var(--bg-surface)' }}>Published</option>
                <option value="draft"     style={{ background: 'var(--bg-surface)' }}>Draft</option>
              </select>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: sCfg.color, background: sCfg.bg, padding: '2px 7px' }}>{sCfg.label}</span>
            )}
          </SidebarRow>

          <SidebarRow icon={Eye} label="Visibility">
            {editing ? (
              <select
                value={form.visibility}
                onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
                style={{ width: '100%', height: 28, padding: '0 6px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
              >
                <option value="internal" style={{ background: 'var(--bg-surface)' }}>Internal</option>
                <option value="public"   style={{ background: 'var(--bg-surface)' }}>Public</option>
              </select>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: vCfg.color }}>{vCfg.label}</span>
            )}
          </SidebarRow>

          <SidebarRow icon={Building2} label="Organization">
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{article.org_name}</span>
          </SidebarRow>

          <SidebarRow icon={User} label="Author">
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{article.author_name ?? '—'}</span>
          </SidebarRow>

          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Created</div>
            <div style={{ ...MONO, fontSize: 11, color: 'var(--text-3)' }}>
              {new Date(article.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, marginTop: 10 }}>Last Updated</div>
            <div style={{ ...MONO, fontSize: 11, color: 'var(--text-3)' }}>
              {new Date(article.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {deleting && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setDeleting(false); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 380 }}>
            <div style={{ padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Delete Article?</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                This resolution article will be permanently deleted. All linked ticket associations will also be removed.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setDeleting(false)}
                style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteArticle.isPending}
                style={{ padding: '6px 16px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: deleteArticle.isPending ? 0.6 : 1 }}
              >
                {deleteArticle.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
