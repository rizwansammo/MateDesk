'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Inbox, History, ExternalLink, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useChatStore } from '@/store/useChatStore';
import { useChat } from '@/context/ChatContext';

interface SessionInfo {
  id:             string;
  session_number: string;
  user_info:      { id: string; full_name: string; email: string };
  agent_info:     { id: string; full_name: string; email: string } | null;
  status:         'waiting' | 'active' | 'ended';
  initiated_by:   'user' | 'agent';
  created_at:     string;
  ended_at:       string | null;
}

const HISTORY_PAGE = 20;

interface Props { onClose: () => void; }

export function AgentSupportPanel({ onClose }: Props) {
  const [tab, setTab]                     = useState<'queue' | 'history'>('queue');
  const [queue, setQueue]                 = useState<SessionInfo[]>([]);
  const [history, setHistory]             = useState<SessionInfo[]>([]);
  const [historyTotal, setHistoryTotal]   = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [loadingQ, setLoadingQ]           = useState(false);
  const [loadingH, setLoadingH]           = useState(false);

  const { acceptSupport }  = useChat();
  const openSupportWindow  = useChatStore((s) => s.openSupportWindow);
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  async function viewHistory(sess: SessionInfo) {
    const winId   = `support_${sess.id}`;
    const { windows, toggleMinimize, appendMessage } = useChatStore.getState();

    if (windows.find((w) => w.id === winId)) {
      toggleMinimize(winId);
      onClose();
      return;
    }

    setLoadingHistory(sess.id);
    try {
      const msgs = await apiFetch<Array<{
        id: string; sender_id: string; sender_type: 'user' | 'agent'; body: string; created_at: string;
      }>>(`/api/chat/support/sessions/${sess.id}/messages/`);

      openSupportWindow(sess.id, sess.user_info.full_name || sess.user_info.email, 'ended');
      msgs.forEach((m) => appendMessage(winId, {
        id: m.id, senderId: m.sender_id, senderType: m.sender_type,
        body: m.body, createdAt: m.created_at,
      }));
    } catch { /* ignore */ }
    finally { setLoadingHistory(null); }
    onClose();
  }

  async function fetchQueue() {
    setLoadingQ(true);
    try {
      const data = await apiFetch<SessionInfo[]>('/api/chat/support/queue/');
      setQueue(data);
    } catch { /* ignore */ }
    finally { setLoadingQ(false); }
  }

  async function fetchHistory(offset = 0, append = false) {
    setLoadingH(true);
    try {
      const data = await apiFetch<{ total: number; sessions: SessionInfo[] }>(
        `/api/chat/support/history/?offset=${offset}`,
      );
      setHistoryTotal(data.total);
      setHistory((prev) => append ? [...prev, ...data.sessions] : data.sessions);
      setHistoryOffset(offset + data.sessions.length);
    } catch { /* ignore */ }
    finally { setLoadingH(false); }
  }

  useEffect(() => { fetchQueue(); fetchHistory(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  const isLoading = loadingQ || loadingH;

  return (
    <div style={{
      position:      'absolute',
      top:           'calc(100% + 8px)',
      right:         0,
      width:         360,
      background:    'var(--bg-surface)',
      border:        '1px solid var(--border-md)',
      borderRadius:  0,
      boxShadow:     '0 12px 48px rgba(0,0,0,0.65)',
      zIndex:        200,
      display:       'flex',
      flexDirection: 'column',
      maxHeight:     520,
    }}>

      {/* ── Title row ──────────────────────────────────────────────────────── */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        padding:      '0 12px',
        height:       40,
        background:   'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink:   0,
      }}>
        <span style={{
          flex: 1, fontWeight: 700, fontSize: 12,
          color: 'var(--text-0)', textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Support Queue
        </span>
        <button
          onClick={() => { fetchQueue(); fetchHistory(0); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-5)', display: 'flex', padding: '4px 6px',
          }}
          title="Refresh"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-5)'; }}
        >
          <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-5)', display: 'flex', padding: '4px 6px',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-5)'; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Tab row ────────────────────────────────────────────────────────── */}
      <div style={{
        display:      'flex',
        flexShrink:   0,
        background:   'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-md)',
      }}>
        {(['queue', 'history'] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex:          1,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                gap:           6,
                height:        36,
                background:    'none',
                border:        'none',
                borderBottom:  active ? '2px solid #6366f1' : '2px solid transparent',
                color:         active ? '#a5b4fc' : 'var(--text-4)',
                fontSize:      12,
                fontWeight:    active ? 700 : 400,
                cursor:        'pointer',
                letterSpacing: '0.03em',
                transition:    'color 0.15s',
              }}
            >
              {t === 'queue' ? <Inbox size={12} /> : <History size={12} />}
              {t === 'queue' ? 'Queue' : 'History'}
              {t === 'queue' && queue.length > 0 && (
                <span style={{
                  background:   '#6366f1', color: '#fff',
                  borderRadius: 2, fontSize: 10,
                  padding:      '0 5px', fontWeight: 700, lineHeight: '16px',
                }}>
                  {queue.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {/* Queue tab */}
        {tab === 'queue' && (
          <>
            {queue.length === 0 && !loadingQ && (
              <div style={{
                padding: '32px 16px', textAlign: 'center',
                color: 'var(--text-5)', fontSize: 12,
              }}>
                No active sessions.
              </div>
            )}
            {queue.map((sess) => (
              <div key={sess.id} style={{
                padding:      '10px 14px',
                borderBottom: '1px solid var(--border-subtle)',
                display:      'flex',
                gap:          10,
                alignItems:   'flex-start',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-0)' }}>
                      {sess.user_info.full_name || sess.user_info.email}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '1px 5px',
                      background: sess.status === 'waiting'
                        ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)',
                      color: sess.status === 'waiting' ? '#fbbf24' : '#4ade80',
                      fontWeight: 600,
                    }}>
                      {sess.status}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 10, color: 'var(--text-5)',
                    fontFamily: 'var(--font-mono)', marginBottom: 2, letterSpacing: '0.04em',
                  }}>
                    {sess.session_number}
                  </div>
                  {sess.agent_info && (
                    <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                      Assigned: {sess.agent_info.full_name}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-5)' }}>
                    {timeAgo(sess.created_at)}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  {sess.status === 'waiting' && (
                    <button
                      onClick={() => { acceptSupport(sess.id); onClose(); }}
                      style={{
                        display:       'flex',
                        alignItems:    'center',
                        gap:           5,
                        padding:       '5px 12px',
                        background:    '#6366f1',
                        border:        'none',
                        borderRadius:  0,
                        color:         '#fff',
                        fontSize:      12,
                        fontWeight:    600,
                        cursor:        'pointer',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#4f46e5'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#6366f1'; }}
                    >
                      <Check size={11} /> Accept
                    </button>
                  )}
                  {sess.status === 'active' && (
                    <button
                      onClick={() => {
                        openSupportWindow(
                          sess.id,
                          sess.user_info.full_name || sess.user_info.email,
                          'active',
                        );
                        onClose();
                      }}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          4,
                        padding:      '5px 10px',
                        background:   'var(--bg-elevated)',
                        border:       '1px solid var(--border-md)',
                        borderRadius: 0,
                        color:        'var(--text-2)',
                        fontSize:     12,
                        cursor:       'pointer',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-5)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
                    >
                      <ExternalLink size={11} /> Open
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <>
            {history.length === 0 && !loadingH && (
              <div style={{
                padding: '32px 16px', textAlign: 'center',
                color: 'var(--text-5)', fontSize: 12,
              }}>
                No session history yet.
              </div>
            )}
            {history.map((sess) => (
              <button
                key={sess.id}
                onClick={() => viewHistory(sess)}
                disabled={loadingHistory === sess.id}
                style={{
                  width: '100%', display: 'block', textAlign: 'left',
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  opacity: loadingHistory === sess.id ? 0.6 : 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', flex: 1 }}>
                    {sess.user_info.full_name || sess.user_info.email}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-5)', flexShrink: 0 }}>
                    {sess.ended_at ? timeAgo(sess.ended_at) : '—'}
                  </span>
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--text-5)',
                  fontFamily: 'var(--font-mono)', marginBottom: 2, letterSpacing: '0.04em',
                }}>
                  {sess.session_number}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {sess.agent_info && (
                    <span style={{ fontSize: 11, color: 'var(--text-4)', flex: 1 }}>
                      {sess.agent_info.full_name}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, color: '#818cf8', fontWeight: 600,
                    letterSpacing: '0.03em',
                  }}>
                    {loadingHistory === sess.id ? 'Loading…' : 'View →'}
                  </span>
                </div>
              </button>
            ))}
            {historyOffset < historyTotal && (
              <button
                onClick={() => fetchHistory(historyOffset, true)}
                disabled={loadingH}
                style={{
                  width:        '100%',
                  padding:      '10px 0',
                  background:   'none',
                  border:       'none',
                  borderTop:    '1px solid var(--border-subtle)',
                  color:        'var(--text-4)',
                  fontSize:     12,
                  cursor:       'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
              >
                {loadingH ? 'Loading…' : `Load more (${historyTotal - historyOffset} remaining)`}
              </button>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
