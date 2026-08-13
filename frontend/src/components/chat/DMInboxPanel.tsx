'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, MessageCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useChatStore } from '@/store/useChatStore';
import { useChat } from '@/context/ChatContext';

interface Conversation {
  partner_id:   string;
  partner_name: string;
  last_message: string;
  last_at:      string;
  unread_count: number;
}

interface Props { onClose: () => void; }

export function DMInboxPanel({ onClose }: Props) {
  const [convos,  setConvos]  = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const { openDM }  = useChat();

  async function fetchInbox() {
    setLoading(true);
    try {
      const data = await apiFetch<Conversation[]>('/api/chat/dm/inbox/');
      setConvos(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchInbox(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)    return `${diff}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  return (
    <div style={{
      position:      'absolute',
      top:           'calc(100% + 8px)',
      right:         0,
      width:         300,
      background:    'var(--bg-surface)',
      border:        '1px solid var(--border-md)',
      borderRadius:  0,
      boxShadow:     '0 12px 48px rgba(0,0,0,0.65)',
      zIndex:        200,
      overflow:      'hidden',
      display:       'flex',
      flexDirection: 'column',
      maxHeight:     400,
    }}>

      {/* Header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '0 12px',
        height:       40,
        background:   'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-md)',
        flexShrink:   0,
      }}>
        <MessageCircle size={13} style={{ color: 'var(--accent-indigo-fg)' }} />
        <span style={{
          flex: 1, fontWeight: 700, fontSize: 12,
          color: 'var(--text-0)', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Messages
        </span>
        <button
          onClick={fetchInbox}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', display: 'flex', padding: '4px 6px',
          }}
          title="Refresh"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', display: 'flex', padding: '4px 6px',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {convos.length === 0 && !loading && (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--text-3)', fontSize: 12,
          }}>
            No conversations yet.
          </div>
        )}
        {convos.map((c) => {
          const isOnline = onlineUsers.has(c.partner_id);
          return (
            <button
              key={c.partner_id}
              onClick={() => { openDM(c.partner_id, c.partner_name); onClose(); }}
              style={{
                width:        '100%',
                display:      'flex',
                alignItems:   'center',
                gap:          10,
                padding:      '9px 12px',
                background:   'none',
                border:       'none',
                borderBottom: '1px solid var(--border-subtle)',
                cursor:       'pointer',
                textAlign:    'left',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isOnline ? '#22c55e' : 'var(--text-3)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                  <span style={{
                    fontWeight: 600, fontSize: 13, color: 'var(--text-0)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {c.partner_name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                    {timeAgo(c.last_at)}
                  </span>
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-4)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.last_message}
                </div>
              </div>
              {c.unread_count > 0 && (
                <span style={{
                  background: '#6366f1', color: '#fff',
                  fontSize: 10, padding: '1px 5px', fontWeight: 700, flexShrink: 0,
                }}>
                  {c.unread_count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
