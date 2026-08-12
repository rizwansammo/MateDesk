'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Search, Loader2, AlertCircle, Pencil, Trash2, X, Check } from 'lucide-react';
import { useKBArticles, useDeleteKBArticle, type KBArticle } from '@/hooks/useKB';
import { useAuthStore } from '@/store/useAuthStore';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  published: { label: 'Published', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  draft:     { label: 'Draft',     color: '#fbbf24', bg: 'rgba(245,158,11,0.12)' },
};

const VIS_CFG: Record<string, { label: string; color: string }> = {
  internal: { label: 'Internal', color: '#818cf8' },
  public:   { label: 'Public',   color: '#60a5fa' },
};

export default function KBResolutionsPage() {
  const router          = useRouter();
  const { user }        = useAuthStore();
  const isMSP           = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const [q, setQ]                         = useState('');
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const { data: articles = [], isLoading, isError } = useKBArticles('resolution', q || undefined);
  const deleteArticle = useDeleteKBArticle();

  function confirmDelete(id: string) {
    deleteArticle.mutate(id, { onSuccess: () => setDeletingId(null) });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <BookOpen size={13} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Knowledge Base</span>
        <span style={{ color: 'var(--border-md)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Resolutions</span>
      </div>

      <div className="flex-1 overflow-auto p-5">

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center flex-1 max-w-sm" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-md)', height: 34 }}>
            <Search size={13} style={{ color: 'var(--text-4)', marginLeft: 10, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search resolutions…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ flex: 1, height: '100%', padding: '0 10px', background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
            />
            {q && (
              <button onClick={() => setQ('')} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          {isMSP && (
            <button
              onClick={() => router.push('/kb/resolutions/new')}
              className="flex items-center gap-1.5"
              style={{ height: 34, padding: '0 14px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d4ed8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2563eb'; }}
            >
              <Plus size={12} /> New Article
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin" style={{ color: '#2563eb' }} />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <AlertCircle size={24} style={{ color: '#f87171' }} />
              <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Failed to load articles.</p>
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <BookOpen size={32} style={{ color: 'var(--text-5)' }} />
              <p style={{ fontSize: 13, color: 'var(--text-5)' }}>
                {q ? 'No results match your search.' : 'No resolution articles yet.'}
              </p>
              {isMSP && !q && (
                <button
                  onClick={() => router.push('/kb/resolutions/new')}
                  style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Create the first one →
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Visibility</th>
                  <th>Organization</th>
                  <th>Author</th>
                  <th>Linked Tickets</th>
                  <th>Updated</th>
                  {isMSP && <th />}
                </tr>
              </thead>
              <tbody>
                {articles.map((a: KBArticle) => {
                  const sCfg = STATUS_CFG[a.status] ?? STATUS_CFG.published;
                  const vCfg = VIS_CFG[a.visibility] ?? VIS_CFG.internal;
                  return (
                    <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/kb/resolutions/${a.id}`)}>
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa' }}>{a.title}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 600, color: sCfg.color, background: sCfg.bg, padding: '2px 7px' }}>
                          {sCfg.label}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 600, color: vCfg.color }}>
                          {vCfg.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.org_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{a.author_name ?? '—'}</td>
                      <td style={{ fontSize: 12, color: a.linked_tickets.length > 0 ? '#60a5fa' : 'var(--text-5)', fontWeight: a.linked_tickets.length > 0 ? 600 : 400 }}>
                        {a.linked_tickets.length > 0 ? `${a.linked_tickets.length} ticket${a.linked_tickets.length > 1 ? 's' : ''}` : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-4)' }}>
                        {new Date(a.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      {isMSP && (
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => router.push(`/kb/resolutions/${a.id}`)}
                              style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px 4px' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                              title="Edit"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setDeletingId(a.id)}
                              style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px 4px' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {deletingId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingId(null); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 380 }}>
            <div style={{ padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Delete Article?</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                This resolution article will be permanently deleted. Linked ticket associations will also be removed.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setDeletingId(null)}
                style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deletingId)}
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
