'use client';

import React, { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { X, Minus, MessageCircle, Headphones } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore, ChatWindow, ChatMessage } from '@/store/useChatStore';
import { useChat } from '@/context/ChatContext';
import { getInitials, getAvatarColor } from '@/lib/utils';

const W = 320;
const BODY_H = 288;

const MSP_ROLES = new Set(['msp_owner', 'msp_manager', 'msp_agent']);

// ── Presence dot ─────────────────────────────────────────────────────────────

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: online ? '#22c55e' : '#475569',
      boxShadow: online ? '0 0 0 2px rgba(34,197,94,0.2)' : 'none',
    }} />
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const bg = getAvatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.38,
      fontWeight: 700, color: '#fff', letterSpacing: '0.02em',
    }}>
      {getInitials(name)}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg, myId, isSupport }: {
  msg: ChatMessage; myId: string; isSupport: boolean;
}) {
  const isMine  = msg.senderId === myId;
  const isSystem = msg.senderId === 'system';

  if (isSystem) {
    if (msg.body === '__END_REQUEST__') return null;   // shown as banner
    if (msg.body === '__AGENT_INITIATION__') return null; // shown as banner
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isMine ? 'flex-end' : 'flex-start',
      gap: 2,
    }}>
      {isSupport && !isMine && (
        <span style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: 2 }}>
          {msg.senderType === 'agent' ? 'Support Agent' : 'You'}
        </span>
      )}
      <div style={{
        maxWidth: '82%',
        padding: '7px 11px',
        borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: isMine
          ? 'linear-gradient(135deg, #6366f1, #818cf8)'
          : 'var(--bg-elevated)',
        color: isMine ? '#fff' : 'var(--text-1)',
        fontSize: 13,
        lineHeight: 1.45,
        wordBreak: 'break-word',
        boxShadow: isMine
          ? '0 1px 4px rgba(99,102,241,0.3)'
          : '0 1px 3px rgba(0,0,0,0.2)',
      }}>
        {msg.body}
      </div>
    </div>
  );
}

// ── End-request confirmation banner ──────────────────────────────────────────

function EndRequestBanner({ sessionId, onDismiss, onDecline }: {
  sessionId: string;
  onDismiss: () => void;
  onDecline: () => void;
}) {
  const { confirmEndSession } = useChat();
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    setConfirming(true);
    confirmEndSession(sessionId);
  }

  return (
    <div style={{
      padding: '8px 12px',
      background: 'rgba(239,68,68,0.07)',
      borderTop: '1px solid rgba(239,68,68,0.2)',
      display: 'flex', gap: 8, alignItems: 'center', fontSize: 12,
      flexShrink: 0,
    }}>
      <span style={{ flex: 1, color: 'var(--text-2)', fontSize: 11 }}>
        {confirming ? 'Ending session…' : 'Agent wants to end this session'}
      </span>
      {!confirming && (
        <>
          <button
            onClick={handleConfirm}
            style={{
              background: '#ef4444', border: 'none', color: '#fff',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              padding: '4px 10px', letterSpacing: '0.03em',
            }}
          >
            Confirm
          </button>
          <button
            onClick={() => { onDecline(); onDismiss(); }}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
              color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, padding: '4px 8px',
            }}
          >
            Decline
          </button>
        </>
      )}
    </div>
  );
}

// ── Agent-initiation accept banner ────────────────────────────────────────────

function InitiationBanner({ sessionId }: { sessionId: string }) {
  const { acceptInitiation } = useChat();
  return (
    <div style={{
      padding: '8px 12px',
      background: 'rgba(99,102,241,0.07)',
      borderTop: '1px solid rgba(99,102,241,0.2)',
      display: 'flex', gap: 8, alignItems: 'center', fontSize: 12,
      flexShrink: 0,
    }}>
      <span style={{ flex: 1, color: 'var(--text-2)', fontSize: 11 }}>
        Support agent wants to chat
      </span>
      <button
        onClick={() => acceptInitiation(sessionId)}
        style={{
          background: '#6366f1', border: 'none', color: '#fff',
          cursor: 'pointer', fontSize: 11, fontWeight: 700,
          padding: '4px 10px', letterSpacing: '0.03em',
        }}
      >
        Accept
      </button>
    </div>
  );
}

// ── Main ChatBar ──────────────────────────────────────────────────────────────

export function ChatBar({ win }: { win: ChatWindow }) {
  const myId     = useAuthStore((s) => s.user?.id ?? '');
  const userRole = useAuthStore((s) => s.user?.role ?? '');
  const isAgent  = MSP_ROLES.has(userRole);
  const isOnline = useChatStore((s) => win.partnerId ? s.onlineUsers.has(win.partnerId) : false);

  const [draft, setDraft]                   = useState('');
  const [dismissedEndCount, setDismissedEndCount] = useState(0);
  const [endRequested, setEndRequested]     = useState(false);

  const endRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { closeWindow, toggleMinimize } = useChatStore.getState();
  const { sendDM, sendSupportMessage, markDMRead, requestEndSession, declineEndSession, forceEndSession } = useChat();

  const isSupport = win.type === 'support';
  const isEnded   = win.sessionStatus === 'ended';
  const isWaiting = win.sessionStatus === 'waiting';
  const isActive  = win.sessionStatus === 'active';

  const endRequestCount = win.messages.filter(
    (m) => m.body === '__END_REQUEST__' && m.senderId === 'system'
  ).length;
  const hasEndReq = !isAgent && !isEnded && endRequestCount > dismissedEndCount;
  const hasInitBan = isSupport && isWaiting &&
    win.messages.some((m) => m.body === '__AGENT_INITIATION__' && m.senderId === 'system');

  // Derive end-session button state for agents
  const canRequestEnd = isAgent && isSupport && isActive && win.sessionId;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [win.messages.length]);

  useEffect(() => {
    if (!win.minimized && win.type === 'dm' && win.partnerId) {
      markDMRead(win.partnerId);
    }
  }, [win.minimized, win.type, win.partnerId, markDMRead]);

  useEffect(() => {
    if (isEnded) { setEndRequested(false); setDismissedEndCount(0); }
  }, [isEnded]);

  useEffect(() => {
    const declined = win.messages.some((m) => m.body === '__END_DECLINED__' && m.senderId === 'system');
    if (declined) setEndRequested(false);
  }, [win.messages]);

  function send() {
    const body = draft.trim();
    if (!body || isEnded) return;
    if (win.type === 'dm' && win.partnerId) {
      sendDM(win.partnerId, body);
    } else if (win.type === 'support' && win.sessionId) {
      sendSupportMessage(win.sessionId, body);
    }
    setDraft('');
    inputRef.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleEndClick() {
    if (!win.sessionId) return;
    setEndRequested(true);
    requestEndSession(win.sessionId);
  }

  const Icon = isSupport ? Headphones : MessageCircle;
  const iconColor = isSupport ? '#a78bfa' : '#818cf8';

  // ── Status badge ────────────────────────────────────────────────────────────

  function StatusBadge() {
    if (!isSupport || !win.sessionStatus) return null;
    const cfg = {
      waiting: { label: 'Waiting', bg: 'var(--accent-warn-bg)', color: 'var(--accent-warn-fg)' },
      active:  { label: 'Active',  bg: 'var(--accent-ok-bg)',  color: 'var(--accent-ok-fg)' },
      ended:   { label: 'Ended',   bg: 'var(--accent-neutral-bg)', color: 'var(--text-3)' },
    }[win.sessionStatus] ?? { label: win.sessionStatus, bg: 'transparent', color: 'var(--text-4)' };
    return (
      <span style={{
        fontSize: 10, padding: '2px 7px', fontWeight: 700,
        background: cfg.bg, color: cfg.color, flexShrink: 0,
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>
        {cfg.label}
      </span>
    );
  }

  return (
    <div style={{
      width: W,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 -2px 24px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.4)',
      border: '1px solid var(--border-md)',
      borderBottom: 'none',
      background: 'var(--bg-surface)',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        onClick={() => toggleMinimize(win.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 10px', height: 44, flexShrink: 0,
          background: 'var(--bg-elevated)',
          cursor: 'pointer', userSelect: 'none',
          borderBottom: win.minimized ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        <Icon size={14} color={iconColor} style={{ flexShrink: 0 }} />
        {!isSupport && <OnlineDot online={isOnline} />}

        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-0)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {win.partnerName}
          {win.unread > 0 && win.minimized && (
            <span style={{
              marginLeft: 6, background: '#ef4444', color: '#fff',
              fontSize: 10, padding: '1px 5px', fontWeight: 700,
              borderRadius: 2, verticalAlign: 'middle',
            }}>
              {win.unread}
            </span>
          )}
        </span>

        <StatusBadge />

        {/* Agent end-session button — dynamic state */}
        {canRequestEnd && !endRequested && (
          <button
            onClick={(e) => { e.stopPropagation(); handleEndClick(); }}
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px',
              border: '1px solid rgba(248,113,113,0.4)',
              background: 'rgba(248,113,113,0.1)',
              color: 'var(--accent-danger-fg)', cursor: 'pointer',
              letterSpacing: '0.03em', flexShrink: 0,
              transition: 'all 0.2s',
            }}
            title="End session"
          >
            End
          </button>
        )}
        {canRequestEnd && endRequested && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px',
              border: '1px solid rgba(251,191,36,0.4)',
              background: 'rgba(251,191,36,0.1)',
              color: 'var(--accent-warn-fg)', letterSpacing: '0.03em',
            }}>
              Requested…
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); win.sessionId && forceEndSession(win.sessionId); }}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 7px',
                border: '1px solid rgba(239,68,68,0.5)',
                background: 'rgba(239,68,68,0.15)',
                color: 'var(--accent-danger-fg)', cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
              title="Force end — use if user is unresponsive"
            >
              Force
            </button>
          </div>
        )}

        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 3px', display: 'flex', alignItems: 'center' }}
          onClick={(e) => { e.stopPropagation(); toggleMinimize(win.id); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <Minus size={13} />
        </button>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 3px', display: 'flex', alignItems: 'center' }}
          onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Body — hidden when minimized ─────────────────────────────────────── */}
      {!win.minimized && (
        <>
          {/* Waiting indicator strip */}
          {isWaiting && isSupport && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', flexShrink: 0,
              background: 'rgba(251,191,36,0.07)',
              borderBottom: '1px solid rgba(251,191,36,0.15)',
              fontSize: 11, color: 'var(--accent-warn-fg)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#fbbf24',
                animation: 'pulse 1.5s ease-in-out infinite',
                flexShrink: 0,
              }} />
              {isAgent ? 'Waiting for user to accept…' : 'Waiting for an agent to join…'}
            </div>
          )}

          {/* Messages — FIXED height, always scrollable */}
          <div style={{
            height: isWaiting && isSupport ? BODY_H - 28 : BODY_H,
            overflowY: 'auto',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}>
            {win.messages.filter((m) =>
              m.body !== '__AGENT_INITIATION__' &&
              m.body !== '__END_REQUEST__' &&
              m.body !== '__END_DECLINED__'
            ).map((msg) => (
              <Bubble key={msg.id} msg={msg} myId={myId} isSupport={isSupport} />
            ))}
            {win.messages.filter((m) =>
              m.body !== '__AGENT_INITIATION__' &&
              m.body !== '__END_REQUEST__' &&
              m.body !== '__END_DECLINED__'
            ).length === 0 && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-3)', fontSize: 12,
              }}>
                {isWaiting && isSupport
                  ? (isAgent ? 'Waiting for user to accept…' : 'Waiting for an agent…')
                  : 'No messages yet.'
                }
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Banners — sit below messages, above input */}
          {hasInitBan && win.sessionId && <InitiationBanner sessionId={win.sessionId} />}
          {hasEndReq && win.sessionId && (
            <EndRequestBanner
              sessionId={win.sessionId}
              onDismiss={() => setDismissedEndCount((c) => c + 1)}
              onDecline={() => declineEndSession(win.sessionId!)}
            />
          )}

          {/* Ended state */}
          {isEnded && (
            <div style={{
              fontSize: 11, textAlign: 'center', padding: '7px 10px',
              color: 'var(--text-3)', background: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)', flexShrink: 0,
            }}>
              This session has ended.
            </div>
          )}

          {/* Input */}
          {!isEnded && !hasInitBan && (
            <div style={{
              display: 'flex', gap: 6, padding: '8px 10px', flexShrink: 0,
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
            }}>
              <textarea
                ref={inputRef}
                rows={1}
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-md)',
                  color: 'var(--text-1)',
                  fontSize: 13,
                  padding: '7px 10px',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: '1.4',
                  maxHeight: 36,
                  overflow: 'hidden',
                }}
                placeholder="Message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                disabled={isWaiting && isSupport}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
              />
              <button
                onClick={send}
                disabled={!draft.trim()}
                style={{
                  background: draft.trim() ? '#6366f1' : 'var(--bg-elevated)',
                  border: draft.trim() ? 'none' : '1px solid var(--border-md)',
                  color: draft.trim() ? '#fff' : 'var(--text-3)',
                  cursor: draft.trim() ? 'pointer' : 'default',
                  fontSize: 12, fontWeight: 700, padding: '0 14px',
                  flexShrink: 0, letterSpacing: '0.03em',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                Send
              </button>
            </div>
          )}
        </>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
