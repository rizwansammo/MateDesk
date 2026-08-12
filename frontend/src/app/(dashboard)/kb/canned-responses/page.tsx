'use client';

import React, { useState } from 'react';
import { Archive, Plus, Pencil, Trash2, ChevronLeft, X, Loader2, AlertCircle, FolderOpen, MessageSquare, BookOpen } from 'lucide-react';
import {
  useCannedCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useCannedResponses, useCreateResponse, useUpdateResponse, useDeleteResponse,
} from '@/hooks/useCanned';
import type { CannedCategory, CannedResponse } from '@/types/canned';

// ── Modal helpers ─────────────────────────────────────────────────────────────

interface ModalWrapProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
}

function ModalWrap({ title, onClose, children }: ModalWrapProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      />
      <div
        style={{
          position: 'fixed', zIndex: 8001,
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(520px, 94vw)',
          background: 'var(--bg-deep)',
          border: '1px solid var(--border-panel)',
          borderTop: '2px solid #34d399',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border-panel)', background: 'var(--bg-surface)' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{title}</span>
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', borderRadius: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '16px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  background: 'var(--bg-card)', border: '1px solid var(--border-md)',
  color: 'var(--text-1)', borderRadius: 5, outline: 'none',
  boxSizing: 'border-box',
};

function SaveBtn({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
        fontSize: 13, fontWeight: 600,
        background: '#059669', color: '#fff',
        border: 'none', borderRadius: 6, cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.65 : 1,
      }}
    >
      {pending && <Loader2 size={12} className="animate-spin" />}
      {label}
    </button>
  );
}

// ── Category form modal ───────────────────────────────────────────────────────

interface CatFormProps {
  initial?: string;
  onClose:  () => void;
  onSave:   (name: string) => Promise<void>;
}

function CategoryFormModal({ initial = '', onClose, onSave }: CatFormProps) {
  const [name,     setName]     = useState(initial);
  const [saving,   setSaving]   = useState(false);
  const [localErr, setLocalErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setLocalErr('Name is required.'); return; }
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch {
      setLocalErr('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalWrap title={initial ? 'Rename Category' : 'New Category'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {localErr && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, fontSize: 12, color: '#f87171' }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{localErr}
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Category Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Onboarding, Initial Reply…"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', fontSize: 13, background: 'transparent', border: '1px solid var(--border-panel)', color: 'var(--text-4)', borderRadius: 6, cursor: 'pointer' }}>
            Cancel
          </button>
          <SaveBtn pending={saving} label={initial ? 'Rename' : 'Create'} />
        </div>
      </form>
    </ModalWrap>
  );
}

// ── Response form modal ───────────────────────────────────────────────────────

interface RespFormProps {
  initial?:   { title: string; body: string };
  categoryId: string;
  onClose:    () => void;
  onSave:     (data: { title: string; body: string }) => Promise<void>;
}

function ResponseFormModal({ initial, categoryId: _catId, onClose, onSave }: RespFormProps) {
  const [title,  setTitle]  = useState(initial?.title ?? '');
  const [body,   setBody]   = useState(initial?.body  ?? '');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!body.trim())  { setErr('Message body is required.'); return; }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body: body.trim() });
      onClose();
    } catch {
      setErr('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalWrap title={initial ? 'Edit Response' : 'New Canned Response'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {err && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, fontSize: 12, color: '#f87171' }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{err}
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
            Title <span style={{ color: 'var(--text-5)', fontWeight: 400 }}>— short label to identify this response</span>
          </label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Welcome email, Password reset…"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Type the full message here…"
            rows={8}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', fontSize: 13, background: 'transparent', border: '1px solid var(--border-panel)', color: 'var(--text-4)', borderRadius: 6, cursor: 'pointer' }}>
            Cancel
          </button>
          <SaveBtn pending={saving} label={initial ? 'Save Changes' : 'Create Response'} />
        </div>
      </form>
    </ModalWrap>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KBCannedResponsesPage() {
  const { data: categories = [], isLoading: catsLoading } = useCannedCategories();
  const [activeCat,    setActiveCat]    = useState<CannedCategory | null>(null);
  const [catFormOpen,  setCatFormOpen]  = useState(false);
  const [editCatId,    setEditCatId]    = useState('');
  const [editCat,      setEditCat]      = useState<CannedCategory | null>(null);
  const [respFormOpen, setRespFormOpen] = useState(false);
  const [editRespId,   setEditRespId]   = useState('');
  const [editResp,     setEditResp]     = useState<CannedResponse | null>(null);
  const [deleteCatId,  setDeleteCatId]  = useState('');
  const [deleteRespId, setDeleteRespId] = useState('');

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory(editCatId);
  const deleteCategory = useDeleteCategory(deleteCatId);
  const createResponse = useCreateResponse();
  const updateResponse = useUpdateResponse(editRespId);
  const deleteResponse = useDeleteResponse(deleteRespId);

  const { data: responses = [], isLoading: respsLoading } = useCannedResponses(
    activeCat ? { category: activeCat.id } : undefined,
  );

  async function handleCreateCat(name: string) {
    await createCategory.mutateAsync(name);
  }

  async function handleUpdateCat(name: string) {
    await updateCategory.mutateAsync(name);
    if (activeCat?.id === editCatId) {
      setActiveCat(prev => prev ? { ...prev, name } : null);
    }
  }

  async function handleDeleteCat(cat: CannedCategory) {
    setDeleteCatId(cat.id);
    setTimeout(async () => {
      await deleteCategory.mutateAsync();
      if (activeCat?.id === cat.id) setActiveCat(null);
    }, 0);
  }

  async function handleCreateResp(data: { title: string; body: string }) {
    if (!activeCat) return;
    await createResponse.mutateAsync({ category: activeCat.id, ...data });
  }

  async function handleUpdateResp(data: { title: string; body: string }) {
    await updateResponse.mutateAsync(data);
  }

  async function handleDeleteResp(resp: CannedResponse) {
    setDeleteRespId(resp.id);
    setTimeout(async () => { await deleteResponse.mutateAsync(); }, 0);
  }

  // ── Category grid ─────────────────────────────────────────────────────────

  if (!activeCat) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Breadcrumb header */}
        <div className="secondary-bar">
          <BookOpen size={13} style={{ color: '#a78bfa' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Knowledge Base</span>
          <span style={{ color: 'var(--border-md)' }}>·</span>
          <MessageSquare size={12} style={{ color: '#34d399' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Canned Responses</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setCatFormOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              fontSize: 12, fontWeight: 600,
              background: '#059669', color: '#fff',
              border: 'none', borderRadius: 5, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#059669'; }}
          >
            <Plus size={12} /> New Category
          </button>
        </div>

        {/* Category grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {catsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-5)' }} />
            </div>
          ) : categories.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60, color: 'var(--text-5)' }}>
              <FolderOpen size={40} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: 14, color: 'var(--text-3)' }}>No categories yet</div>
              <div style={{ fontSize: 12 }}>Create your first category to start organising canned responses.</div>
              <button
                onClick={() => setCatFormOpen(true)}
                style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                <Plus size={13} /> New Category
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {categories.map(cat => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  onOpen={() => setActiveCat(cat)}
                  onEdit={() => { setEditCatId(cat.id); setEditCat(cat); }}
                  onDelete={() => handleDeleteCat(cat)}
                />
              ))}
            </div>
          )}
        </div>

        {catFormOpen && (
          <CategoryFormModal
            onClose={() => setCatFormOpen(false)}
            onSave={handleCreateCat}
          />
        )}
        {editCat && (
          <CategoryFormModal
            initial={editCat.name}
            onClose={() => setEditCat(null)}
            onSave={handleUpdateCat}
          />
        )}
      </div>
    );
  }

  // ── Responses view (drill-down) ───────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb header with back button */}
      <div className="secondary-bar">
        <button
          onClick={() => setActiveCat(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 11, color: 'var(--text-4)', background: 'transparent', border: '1px solid var(--border-panel)', borderRadius: 4, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft size={11} /> Categories
        </button>
        <BookOpen size={13} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Knowledge Base</span>
        <span style={{ color: 'var(--border-md)' }}>·</span>
        <MessageSquare size={12} style={{ color: '#34d399' }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Canned Responses</span>
        <span style={{ color: 'var(--border-md)' }}>·</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>{activeCat.name}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setRespFormOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#059669'; }}
        >
          <Plus size={12} /> New Response
        </button>
      </div>

      {/* Response cards grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {respsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-5)' }} />
          </div>
        ) : responses.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 60, color: 'var(--text-5)' }}>
            <Archive size={36} style={{ opacity: 0.25 }} />
            <div style={{ fontSize: 13 }}>No responses in this category yet.</div>
            <button
              onClick={() => setRespFormOpen(true)}
              style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              <Plus size={13} /> New Response
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {responses.map(resp => (
              <ResponseCard
                key={resp.id}
                resp={resp}
                onEdit={() => { setEditRespId(resp.id); setEditResp(resp); }}
                onDelete={() => handleDeleteResp(resp)}
              />
            ))}
          </div>
        )}
      </div>

      {respFormOpen && activeCat && (
        <ResponseFormModal
          categoryId={activeCat.id}
          onClose={() => setRespFormOpen(false)}
          onSave={handleCreateResp}
        />
      )}
      {editResp && (
        <ResponseFormModal
          initial={{ title: editResp.title, body: editResp.body }}
          categoryId={activeCat.id}
          onClose={() => setEditResp(null)}
          onSave={handleUpdateResp}
        />
      )}
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  cat, onOpen, onEdit, onDelete,
}: { cat: CannedCategory; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-md)',
        borderRadius: 8, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <button
        onClick={onOpen}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
          padding: '16px 16px 12px', textAlign: 'left', background: 'transparent',
          border: 'none', cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div
          style={{
            width: 38, height: 38, borderRadius: 8,
            background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Archive size={18} style={{ color: '#34d399' }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.3 }}>
          {cat.name}
        </span>
      </button>

      <div
        style={{
          display: 'flex', gap: 2, padding: '8px 10px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
        }}
      >
        <button
          onClick={onOpen}
          style={{ flex: 1, fontSize: 11, color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, textAlign: 'left' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#34d399'; e.currentTarget.style.background = 'rgba(52,211,153,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
        >
          Open →
        </button>
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          title="Rename"
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-5)', borderRadius: 4 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-5)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete category"
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-5)', borderRadius: 4 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-5)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Response card ─────────────────────────────────────────────────────────────

function ResponseCard({
  resp, onEdit, onDelete,
}: { resp: CannedResponse; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-md)',
        borderRadius: 8, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.3 }}>{resp.title}</div>
      </div>

      <div
        style={{
          flex: 1, padding: '10px 14px',
          fontSize: 12, color: 'var(--text-4)', lineHeight: 1.65,
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
        }}
      >
        {resp.body}
      </div>

      <div
        style={{
          display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '8px 10px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
        }}
      >
        <button
          onClick={onEdit}
          title="Edit"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11, color: 'var(--text-4)', background: 'transparent', border: '1px solid var(--border-panel)', borderRadius: 4, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.borderColor = 'var(--border-panel)'; }}
        >
          <Pencil size={10} /> Edit
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11, color: '#f87171', background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Trash2 size={10} /> Delete
        </button>
      </div>
    </div>
  );
}
