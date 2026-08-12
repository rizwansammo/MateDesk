'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useChatStore } from '@/store/useChatStore';
import { useChat } from '@/context/ChatContext';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials, getAvatarColor } from '@/lib/utils';

interface UserInfo {
  id:        string;
  full_name: string;
  email:     string;
  role:      string;
  job_title: string | null;
  org_name:  string | null;
  is_online: boolean;
}

const ROLE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  client_owner: { label: 'Owner',    color: '#a78bfa', bg: 'rgba(139,92,246,0.12)'  },
  end_user:     { label: 'End User', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
};

const MONO: React.CSSProperties = { fontFamily: '"IBM Plex Mono", monospace' };

export default function UsersPage() {
  const router  = useRouter();
  const myId    = useAuthStore((s) => s.user?.id);
  const myRole  = useAuthStore((s) => s.user?.role ?? '');
  const isMSP   = ['msp_owner', 'msp_manager', 'msp_agent'].includes(myRole);

  const [users,   setUsers]   = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState('');

  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const { openDM }  = useChat();

  useEffect(() => {
    if (isMSP) { router.replace('/home'); return; }
    apiFetch<UserInfo[]>('/api/chat/users/')
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [isMSP, router]);

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div style={{
        flexShrink: 0, height: 38, display: 'flex', alignItems: 'center',
        gap: 10, padding: '0 16px',
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--text-0)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Users
        </span>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--text-5)' }}>
          {users.length > 0 && `${users.length} members`}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--text-5)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users…"
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
              color: 'var(--text-0)', fontSize: 12, padding: '5px 10px 5px 28px',
              outline: 'none', width: 200,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 20px' }}>
        {loading && (
          <div style={{ color: 'var(--text-5)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ color: 'var(--text-5)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            {query ? 'No users match your search.' : 'No other users found.'}
          </div>
        )}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {filtered.map((u) => {
              const isOnline    = onlineUsers.has(u.id);
              const roleCfg     = ROLE_CFG[u.role] ?? { label: u.role, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
              const avatarColor = getAvatarColor(u.full_name);
              const initials    = getInitials(u.full_name);
              const isSelf      = u.id === myId;

              return (
                <div
                  key={u.id}
                  style={{
                    background: 'var(--bg-card)',
                    border:     '1px solid var(--border-md)',
                    padding:    '14px 16px',
                    display:    'flex',
                    alignItems: 'center',
                    gap:        12,
                    cursor:     'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onClick={() => router.push(`/users/${u.id}`)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-5)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
                >
                  {/* Avatar + presence */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: avatarColor, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff',
                    }}>
                      {initials}
                    </div>
                    <span style={{
                      position: 'absolute', bottom: 1, right: 1,
                      width: 9, height: 9, borderRadius: '50%',
                      background: isOnline ? '#22c55e' : 'var(--text-5)',
                      border: '1.5px solid var(--bg-card)',
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                      {u.full_name}
                    </div>
                    <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: roleCfg.color, background: roleCfg.bg, padding: '1px 6px' }}>
                      {roleCfg.label}
                    </span>
                  </div>

                  {/* Message button (not for self) */}
                  {!isSelf && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDM(u.id, u.full_name);
                      }}
                      style={{
                        background:  'rgba(99,102,241,0.12)',
                        border:      '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 6,
                        color:       '#818cf8',
                        cursor:      'pointer',
                        padding:     '5px 8px',
                        display:     'flex',
                        alignItems:  'center',
                        gap:         4,
                        fontSize:    11,
                        fontWeight:  600,
                        flexShrink:  0,
                        whiteSpace:  'nowrap',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.22)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.12)'; }}
                      title={`Message ${u.full_name}`}
                    >
                      <MessageCircle size={12} /> Message
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
