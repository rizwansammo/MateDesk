'use client';

import React from 'react';
import { X, Check, Headphones } from 'lucide-react';
import { useChatStore, IncomingSession } from '@/store/useChatStore';
import { useChat } from '@/context/ChatContext';
import { useAuthStore } from '@/store/useAuthStore';

const MSP_ROLES = new Set(['msp_owner', 'msp_manager', 'msp_agent']);

function IncomingCard({ session }: { session: IncomingSession }) {
  const { acceptSupport, dismissSupport } = useChat();
  const { dismissIncoming } = useChatStore.getState();

  return (
    <div style={{
      width:      300,
      background: 'var(--bg-surface)',
      border:     '1px solid var(--border-md)',
      borderLeft: '3px solid #6366f1',
      boxShadow:  '0 8px 32px rgba(0,0,0,0.6)',
      overflow:   'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '0 10px',
        height:       36,
        background:   'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <Headphones size={13} color="#a78bfa" />
        <span style={{ flex: 1, fontWeight: 700, fontSize: 12, color: 'var(--text-0)' }}>
          {session.userName}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.03em',
        }}>
          {session.sessionNumber}
        </span>
        <button
          onClick={() => { dismissIncoming(session.id); dismissSupport(session.id); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: '4px 4px 4px 8px', display: 'flex',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>

      {/* Preview */}
      <div style={{ padding: '8px 12px' }}>
        <p style={{
          margin: 0, fontSize: 12, color: 'var(--text-3)',
          lineHeight: 1.5, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
        }}>
          {session.body}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
        <button
          onClick={() => acceptSupport(session.id)}
          style={{
            flex:           1,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            5,
            padding:        '7px 0',
            background:     '#6366f1',
            border:         'none',
            borderRadius:   0,
            color:          '#fff',
            fontSize:       12,
            fontWeight:     700,
            cursor:         'pointer',
            letterSpacing:  '0.03em',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#4f46e5'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#6366f1'; }}
        >
          <Check size={12} /> Accept
        </button>
        <button
          onClick={() => { dismissIncoming(session.id); dismissSupport(session.id); }}
          style={{
            padding:      '7px 14px',
            background:   'var(--bg-elevated)',
            border:       '1px solid var(--border-md)',
            borderRadius: 0,
            color:        'var(--text-3)',
            fontSize:     12,
            cursor:       'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function AgentIncomingPopup() {
  const role              = useAuthStore((s) => s.user?.role ?? '');
  const incomingQueue     = useChatStore((s) => s.incomingQueue);
  const dismissedSessions = useChatStore((s) => s.dismissedSessions);

  if (!MSP_ROLES.has(role)) return null;

  const visible = incomingQueue.filter((s) => !dismissedSessions.has(s.id));
  if (visible.length === 0) return null;

  return (
    <div style={{
      position:      'fixed',
      bottom:        16,
      left:          16,
      display:       'flex',
      flexDirection: 'column',
      gap:           8,
      zIndex:        1100,
      pointerEvents: 'none',
    }}>
      {visible.map((session) => (
        <div key={session.id} style={{ pointerEvents: 'auto' }}>
          <IncomingCard session={session} />
        </div>
      ))}
    </div>
  );
}
