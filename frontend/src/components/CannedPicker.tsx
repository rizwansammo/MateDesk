'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCannedCategories, useCannedResponses } from '@/hooks/useCanned';
import type { CannedCategory, CannedResponse } from '@/types/canned';

interface Props {
  onSelect: (body: string) => void;
  onClose:  () => void;
}

export function CannedPicker({ onSelect, onClose }: Props) {
  const [search,      setSearch]      = useState('');
  const [selectedCat, setSelectedCat] = useState<CannedCategory | null>(null);
  const [hoveredResp, setHoveredResp] = useState<CannedResponse | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useCannedCategories();

  // Fetch responses for search OR selected category
  const isSearching = search.trim().length > 0;
  const { data: responses = [] } = useCannedResponses(
    isSearching
      ? { q: search.trim() }
      : selectedCat
      ? { category: selectedCat.id }
      : undefined,
  );

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Reset hovered response when list changes
  useEffect(() => {
    setHoveredResp(responses[0] ?? null);
  }, [responses]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSelect(resp: CannedResponse) {
    onSelect(resp.body);
    onClose();
  }

  // ── Category card grid ───────────────────────────────────────────────────

  function CategoryGrid() {
    if (categories.length === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, color: 'var(--text-5)' }}>
          <Archive size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 13 }}>No categories yet. Create them in Settings → Canned Responses.</span>
        </div>
      );
    }

    return (
      <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
              padding: '14px 14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-md)',
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(37,99,235,0.5)';
              e.currentTarget.style.background  = 'var(--bg-elevated)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-md)';
              e.currentTarget.style.background  = 'var(--bg-card)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <Archive size={14} style={{ color: '#60a5fa' }} />
              </div>
              <ChevronRight size={12} style={{ color: 'var(--text-5)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
              {cat.name}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // ── Response list + preview (two-column) ─────────────────────────────────

  function ResponseView() {
    if (responses.length === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, color: 'var(--text-5)', padding: 20 }}>
          <Archive size={28} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 13 }}>
            {isSearching ? `No responses match "${search}"` : 'No responses in this category.'}
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: response title list */}
        <div
          style={{
            width: 240, flexShrink: 0,
            borderRight: '1px solid var(--border-subtle)',
            overflowY: 'auto',
          }}
        >
          {isSearching && responses.length > 0 && (() => {
            // Group by category_name
            const groups: Record<string, CannedResponse[]> = {};
            for (const r of responses) {
              (groups[r.category_name] ??= []).push(r);
            }
            return Object.entries(groups).map(([catName, items]) => (
              <div key={catName}>
                <div
                  style={{
                    padding: '6px 14px 4px',
                    fontSize: 10, fontWeight: 700,
                    color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '0.08em',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  {catName}
                </div>
                {items.map(resp => (
                  <ResponseRow key={resp.id} resp={resp} />
                ))}
              </div>
            ));
          })()}

          {!isSearching && responses.map(resp => (
            <ResponseRow key={resp.id} resp={resp} />
          ))}
        </div>

        {/* Right: preview */}
        <div
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '14px 16px', minWidth: 0,
          }}
        >
          {hoveredResp ? (
            <div
              style={{
                display: 'flex', flexDirection: 'column', height: '100%',
                opacity: 1, transform: 'translateY(0)',
                transition: 'opacity 0.18s, transform 0.18s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                PREVIEW
              </div>
              <div
                style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text-0)', marginBottom: 10,
                  paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {hoveredResp.title}
              </div>
              <div
                style={{
                  flex: 1, overflowY: 'auto', fontSize: 13, color: 'var(--text-2)',
                  lineHeight: 1.65, whiteSpace: 'pre-wrap', marginBottom: 12,
                }}
              >
                {hoveredResp.body}
              </div>
              <button
                onClick={() => handleSelect(hoveredResp)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  background: 'rgba(37,99,235,0.9)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2563eb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.9)'; }}
              >
                Use this response
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-5)', fontSize: 12 }}>
              Hover a response to preview
            </div>
          )}
        </div>
      </div>
    );
  }

  function ResponseRow({ resp }: { resp: CannedResponse }) {
    const isHovered = hoveredResp?.id === resp.id;
    return (
      <button
        onMouseEnter={() => setHoveredResp(resp)}
        onClick={() => handleSelect(resp)}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: isHovered ? 'rgba(37,99,235,0.08)' : 'transparent',
          borderLeft: isHovered ? '2px solid #3b82f6' : '2px solid transparent',
          cursor: 'pointer', transition: 'background 0.12s',
        }}
        onMouseLeave={() => {}} // keep hovered until another takes over
      >
        <span style={{ fontSize: 12, fontWeight: isHovered ? 600 : 400, color: isHovered ? 'var(--text-0)' : 'var(--text-2)', display: 'block' }}>
          {resp.title}
        </span>
      </button>
    );
  }

  const showResponseView = isSearching || selectedCat !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 8900,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed', zIndex: 8901,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(700px, 95vw)',
          height: 'min(520px, 85vh)',
          background: 'var(--bg-deep)',
          border: '1px solid var(--border-panel)',
          borderTop: '2px solid #3b82f6',
          borderRadius: 0,
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)', flexShrink: 0,
          }}
        >
          {/* Back button (when in a category) */}
          {selectedCat && !isSearching && (
            <button
              onClick={() => { setSelectedCat(null); setHoveredResp(null); }}
              style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', borderRadius: 4, flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <ChevronLeft size={14} />
            </button>
          )}

          <Archive size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />

          {/* Breadcrumb */}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flexShrink: 0 }}>
            {selectedCat && !isSearching ? selectedCat.name : 'Canned Responses'}
          </span>

          {/* Search */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderRadius: 5, padding: '0 10px', height: 30 }}>
            <Search size={12} style={{ color: 'var(--text-5)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                if (e.target.value.trim()) setSelectedCat(null);
              }}
              placeholder="Search all responses…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 12, color: 'var(--text-1)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-5)', display: 'flex', alignItems: 'center', padding: 0 }}
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: showResponseView ? 'hidden' : 'auto' }}>
          {showResponseView ? <ResponseView /> : <CategoryGrid />}
        </div>

        {/* ── Footer hint ── */}
        <div
          style={{
            flexShrink: 0, padding: '6px 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            fontSize: 10, color: 'var(--text-5)', textAlign: 'center',
          }}
        >
          Tip: type <span style={{ fontFamily: 'monospace', background: 'var(--bg-card)', padding: '1px 4px', borderRadius: 3 }}>//c</span> in the reply box to open this picker instantly
        </div>
      </div>
    </>
  );
}
