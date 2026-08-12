'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Headphones, X, Loader2, CheckCircle2, MessageSquare } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { useChatStore } from '@/store/useChatStore';

interface Props {
  onClose: () => void;
}

export function SupportPopup({ onClose }: Props) {
  const { startSupport, acceptInitiation } = useChat();
  const windows = useChatStore((s) => s.windows);

  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const supportWin = windows.find((w) => w.type === 'support');
  const hasAgentInitiation = supportWin?.sessionStatus === 'waiting' &&
    supportWin.messages.some((m) => m.body === '__AGENT_INITIATION__');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!supportWin) textRef.current?.focus();
  }, [supportWin]);

  function handleStart() {
    const msg = body.trim();
    if (!msg || submitting) return;
    setSubmitting(true);
    startSupport(msg);
    // popup stays open — transitions to "waiting" state automatically
  }

  function handleAccept() {
    if (!supportWin?.sessionId) return;
    acceptInitiation(supportWin.sessionId);
    onClose();
  }

  return (
    <div style={{
      position:      'absolute',
      top:           'calc(100% + 8px)',
      right:         0,
      width:         320,
      background:    'var(--bg-surface)',
      border:        '1px solid var(--border-md)',
      borderRadius:  0,
      boxShadow:     '0 12px 48px rgba(0,0,0,0.65)',
      zIndex:        200,
      overflow:      'hidden',
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
      }}>
        <Headphones size={14} color="#a78bfa" />
        <span style={{
          flex: 1, fontWeight: 700, fontSize: 12,
          color: 'var(--text-0)', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Live Support
        </span>
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

      {/* Body */}
      <div style={{ padding: '16px 14px' }}>

        {/* Agent-initiated pending */}
        {hasAgentInitiation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44,
              background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageSquare size={20} color="#a78bfa" />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                A support agent wants to talk to you
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
                Click below to open the chat session.
              </p>
            </div>
            <button
              onClick={handleAccept}
              style={{
                width: '100%', padding: '9px 0',
                background: '#6366f1', border: 'none', borderRadius: 0,
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#4f46e5'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#6366f1'; }}
            >
              Start Chat
            </button>
          </div>
        )}

        {/* Waiting for agent */}
        {!hasAgentInitiation && supportWin?.sessionStatus === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
            <Loader2 size={26} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
              Looking for an available agent…
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
              Your message is in the queue. An agent will join shortly.
            </p>
          </div>
        )}

        {/* Session active */}
        {!hasAgentInitiation && supportWin?.sessionStatus === 'active' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
            <CheckCircle2 size={26} color="#22c55e" />
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
              Support chat is active
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
              Your chat window is open at the bottom of the screen.
            </p>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '8px 0',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-md)',
                borderRadius: 0, color: 'var(--text-2)',
                fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-5)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
            >
              Close
            </button>
          </div>
        )}

        {/* Session ended */}
        {!hasAgentInitiation && supportWin?.sessionStatus === 'ended' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
              Session ended
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
              Your previous support session has ended.
            </p>
            <button
              onClick={() => {
                if (supportWin) useChatStore.getState().closeWindow(supportWin.id);
              }}
              style={{
                width: '100%', padding: '9px 0',
                background: '#6366f1', border: 'none', borderRadius: 0,
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#4f46e5'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#6366f1'; }}
            >
              Start New Session
            </button>
          </div>
        )}

        {/* Idle: start form */}
        {!supportWin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.6 }}>
              Describe your issue and an available agent will join shortly.
            </p>
            <textarea
              ref={textRef}
              rows={4}
              placeholder="Type your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart();
              }}
              style={{
                width:       '100%',
                background:  'var(--bg-elevated)',
                border:      '1px solid var(--border-md)',
                borderRadius: 0,
                color:       'var(--text-1)',
                fontSize:    13,
                padding:     '9px 11px',
                resize:      'none',
                outline:     'none',
                fontFamily:  'inherit',
                lineHeight:  1.5,
                boxSizing:   'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
            <button
              onClick={handleStart}
              disabled={!body.trim() || submitting}
              style={{
                width:          '100%',
                padding:        '9px 0',
                background:     body.trim() && !submitting ? '#6366f1' : 'var(--bg-elevated)',
                border:         body.trim() && !submitting ? 'none' : '1px solid var(--border-md)',
                borderRadius:   0,
                color:          body.trim() && !submitting ? '#fff' : 'var(--text-5)',
                fontWeight:     700,
                fontSize:       13,
                letterSpacing:  '0.03em',
                cursor:         body.trim() && !submitting ? 'pointer' : 'not-allowed',
                transition:     'background 0.15s, color 0.15s',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            8,
              }}
              onMouseEnter={(e) => { if (body.trim() && !submitting) (e.currentTarget as HTMLElement).style.background = '#4f46e5'; }}
              onMouseLeave={(e) => { if (body.trim() && !submitting) (e.currentTarget as HTMLElement).style.background = '#6366f1'; }}
            >
              {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {submitting ? 'Connecting…' : 'Start Support Chat'}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-5)', textAlign: 'center' }}>
              Ctrl+Enter to submit
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
