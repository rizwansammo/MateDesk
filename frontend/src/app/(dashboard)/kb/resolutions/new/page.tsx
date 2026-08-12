'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Save, Loader2, AlertCircle, X } from 'lucide-react';
import { useCreateKBArticle } from '@/hooks/useKB';
import { useOrganizations } from '@/hooks/useOrganizations';

const lbl = 'block mb-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide';
const inp = 'w-full h-9 px-3 text-[13px] bg-[var(--bg-base)] border border-[var(--border-md)] text-[var(--text-1)] placeholder-[#3d4a6b] outline-none focus:border-[#2563eb] transition-colors';

export default function KBNewArticlePage() {
  const router         = useRouter();
  const create         = useCreateKBArticle();
  const { data: orgs } = useOrganizations();

  const [form, setForm] = useState({
    title:         '',
    content:       '',
    status:        'published',
    visibility:    'internal',
    client_org_id: '',
  });
  const [error, setError] = useState('');

  function handleSubmit() {
    setError('');
    if (!form.title.trim()) { setError('Title is required.'); return; }
    create.mutate(
      {
        category:      'resolution',
        title:         form.title.trim(),
        content:       form.content,
        status:        form.status,
        visibility:    form.visibility,
        client_org_id: form.client_org_id || null,
      },
      {
        onSuccess: (article) => router.push(`/kb/resolutions/${article.id}`),
        onError:   (err: unknown) => {
          setError((err instanceof Error ? err.message : null) ?? 'Failed to create article.');
        },
      }
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/kb/resolutions')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Resolutions
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>New Article</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* Header row */}
          <div className="flex items-center gap-3 mb-6">
            <div style={{
              width: 40, height: 40, flexShrink: 0,
              background: 'rgba(167,139,250,0.12)',
              border: '1px solid rgba(167,139,250,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={18} style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>New Resolution Article</h1>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                Document how an issue was resolved for future reference.
              </p>
            </div>
          </div>

          {/* Form card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '24px 28px' }}>
            <div className="flex flex-col gap-5">

              {/* Title */}
              <div>
                <label className={lbl}>Title *</label>
                <input
                  type="text"
                  autoFocus
                  value={form.title}
                  onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setError(''); }}
                  placeholder="e.g. Resolved by resetting network adapter"
                  className={inp}
                />
              </div>

              {/* Content */}
              <div>
                <label className={lbl}>Details</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Describe the steps taken to resolve this issue…"
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--bg-base)] border border-[var(--border-md)] text-[var(--text-1)] placeholder-[#3d4a6b] outline-none focus:border-[#2563eb] transition-colors resize-y leading-relaxed"
                  style={{ minHeight: 180, display: 'block' }}
                />
              </div>

              {/* Status + Visibility */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className={inp}
                    style={{ cursor: 'pointer', appearance: 'none' }}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Visibility</label>
                  <select
                    value={form.visibility}
                    onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
                    className={inp}
                    style={{ cursor: 'pointer', appearance: 'none' }}
                  >
                    <option value="internal">Internal</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>

              {/* Organization */}
              <div>
                <label className={lbl}>Organization</label>
                <select
                  value={form.client_org_id}
                  onChange={e => setForm(f => ({ ...f, client_org_id: e.target.value }))}
                  className={inp}
                  style={{ cursor: 'pointer', appearance: 'none' }}
                >
                  <option value="">General / Walk-in</option>
                  {(orgs ?? []).map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-2" style={{
                  padding: '10px 14px', fontSize: 12,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#f87171',
                }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={handleSubmit}
                  disabled={create.isPending}
                  className="flex items-center gap-2 px-5 py-2 font-semibold text-white disabled:opacity-50"
                  style={{ background: '#2563eb', fontSize: 12, cursor: 'pointer' }}
                >
                  {create.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {create.isPending ? 'Saving…' : 'Save Article'}
                </button>
                <button
                  onClick={() => router.push('/kb/resolutions')}
                  disabled={create.isPending}
                  className="flex items-center gap-2 px-4 py-2"
                  style={{
                    fontSize: 12, color: 'var(--text-3)', cursor: 'pointer',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
                  }}
                >
                  <X size={12} /> Cancel
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
