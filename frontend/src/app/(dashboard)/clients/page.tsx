'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, ChevronDown, MessageCircle, ExternalLink,
  Search, Building2, Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useChat } from '@/context/ChatContext';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials, getAvatarColor } from '@/lib/utils';

interface OrgUser {
  id:        string;
  full_name: string;
  email:     string;
  role:      string;
  online:    boolean;
}

interface OrgEntry {
  id:         string;
  name:       string;
  user_count: number;
  users:      OrgUser[];
}

const MONO: React.CSSProperties = { fontFamily: '"IBM Plex Mono", monospace' };

const ROLE_CFG: Record<string, { label: string; color: string }> = {
  client_owner: { label: 'Owner',    color: 'var(--accent-violet-fg)' },
  end_user:     { label: 'End User', color: 'var(--text-3)' },
};

export default function ClientsPage() {
  const router   = useRouter();
  const myRole   = useAuthStore((s) => s.user?.role ?? '');
  const isMSP    = ['msp_owner', 'msp_manager', 'msp_agent'].includes(myRole);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const { initiateSupport } = useChat();

  const [orgs,     setOrgs]     = useState<OrgEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isMSP) { router.replace('/home'); return; }
    apiFetch<OrgEntry[]>('/api/chat/org-users/')
      .then(setOrgs)
      .finally(() => setLoading(false));
  }, [isMSP, router]);

  function toggleOrg(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const q = query.toLowerCase();
  const filtered = orgs
    .map((org) => {
      const matchOrg   = org.name.toLowerCase().includes(q);
      const matchUsers = org.users.filter(
        (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
      if (!q || matchOrg) return { ...org, _filtered: org.users };
      if (matchUsers.length > 0) return { ...org, _filtered: matchUsers };
      return null;
    })
    .filter(Boolean) as (OrgEntry & { _filtered: OrgUser[] })[];

  const totalUsers = orgs.reduce((s, o) => s + o.user_count, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div style={{
        flexShrink: 0, height: 42, display: 'flex', alignItems: 'center',
        gap: 10, padding: '0 16px',
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <Users size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--text-0)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Clients
        </span>
        {!loading && (
          <span style={{ ...MONO, fontSize: 11, color: 'var(--text-3)' }}>
            {orgs.length} org{orgs.length !== 1 ? 's' : ''} · {totalUsers} user{totalUsers !== 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search org or user…"
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
      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            {query ? 'No results.' : 'No client organisations found.'}
          </div>
        )}

        {filtered.map((org) => {
          const isOpen = expanded.has(org.id) || (!!q && org._filtered.length > 0);
          return (
            <div key={org.id} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-md)',
              overflow: 'hidden',
            }}>
              {/* Org row */}
              <button
                onClick={() => toggleOrg(org.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Building2 size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {org.name}
                </span>
                <span style={{ ...MONO, fontSize: 11, color: 'var(--text-3)', flexShrink: 0, marginRight: 6 }}>
                  {org.user_count} user{org.user_count !== 1 ? 's' : ''}
                </span>
                {isOpen
                  ? <ChevronDown size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                  : <ChevronRight size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                }
              </button>

              {/* User rows */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {org._filtered.length === 0 && (
                    <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-3)' }}>
                      No users
                    </div>
                  )}
                  {org._filtered.map((user) => {
                    const isOnline    = onlineUsers.has(user.id) || user.online;
                    const roleCfg     = ROLE_CFG[user.role] ?? { label: user.role, color: 'var(--text-3)' };
                    const avatarColor = getAvatarColor(user.full_name);

                    return (
                      <div
                        key={user.id}
                        className="group"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 14px',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {/* Avatar + presence */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: avatarColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: '#fff',
                          }}>
                            {getInitials(user.full_name)}
                          </div>
                          <span style={{
                            position: 'absolute', bottom: 1, right: 1,
                            width: 8, height: 8, borderRadius: '50%',
                            background: isOnline ? '#22c55e' : 'var(--text-3)',
                            border: '1.5px solid var(--bg-card)',
                          }} />
                        </div>

                        {/* Name + role */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.full_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.email}
                          </div>
                        </div>

                        {/* Role badge */}
                        <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: roleCfg.color, flexShrink: 0 }}>
                          {roleCfg.label}
                        </span>

                        {/* Profile */}
                        <button
                          onClick={() => router.push(`/users/${user.id}`)}
                          title="View profile"
                          className="group-hover:!opacity-100"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-4)', padding: '4px',
                            display: 'flex', alignItems: 'center',
                            opacity: 0, transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                        >
                          <ExternalLink size={13} />
                        </button>

                        {/* Support chat */}
                        <button
                          onClick={() => initiateSupport(user.id, user.full_name)}
                          title="Start support chat"
                          className="group-hover:!opacity-100"
                          style={{
                            background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.25)',
                            cursor: 'pointer', color: 'var(--accent-indigo-fg)',
                            padding: '4px 8px', display: 'flex',
                            alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 600,
                            opacity: 0, transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.2)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.1)'; }}
                        >
                          <MessageCircle size={11} /> Chat
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
