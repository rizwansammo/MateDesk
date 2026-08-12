'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, ChevronRight, ChevronDown, MessageCircle, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useChat } from '@/context/ChatContext';
import { apiFetch } from '@/lib/api';

interface OrgUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  online: boolean;
}

interface OrgEntry {
  id: string;
  name: string;
  user_count: number;
  users: OrgUser[];
}

interface Props {
  collapsed: boolean;
}

export function SidebarUsersTree({ collapsed }: Props) {
  const [open, setOpen]               = useState(false);
  const [orgs, setOrgs]               = useState<OrgEntry[]>([]);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(false);
  const router = useRouter();
  const { openDM, initiateSupport }   = useChat();

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<OrgEntry[]>('/api/chat/org-users/')
      .then(data => setOrgs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open && orgs.length === 0 && !loading) load();
  }, [open, orgs.length, loading, load]);

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      next.has(orgId) ? next.delete(orgId) : next.add(orgId);
      return next;
    });
  };

  if (collapsed) return null;

  const rowBase: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div>
      {/* Users toggle row — same visual weight as the Agents link */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...rowBase,
          gap: 12,
          padding: '8px 10px',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-2)',
          borderRadius: 6,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-0)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
        }}
      >
        <Users size={15} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Users
        </span>
        {open
          ? <ChevronDown size={11} style={{ flexShrink: 0, color: 'var(--text-4)' }} />
          : <ChevronRight size={11} style={{ flexShrink: 0, color: 'var(--text-4)' }} />
        }
      </button>

      {open && (
        <div style={{ paddingLeft: 6 }}>
          {loading && (
            <div style={{ fontSize: 11, color: 'var(--text-4)', padding: '4px 10px' }}>
              Loading…
            </div>
          )}

          {!loading && orgs.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-4)', padding: '4px 10px' }}>
              No organisations
            </div>
          )}

          {orgs.map(org => {
            const isExpanded = expandedOrgs.has(org.id);
            return (
              <div key={org.id}>
                {/* Org row */}
                <button
                  onClick={() => toggleOrg(org.id)}
                  style={{
                    ...rowBase,
                    gap: 6,
                    padding: '4px 8px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-3)',
                    borderRadius: 4,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {isExpanded
                    ? <ChevronDown  size={9}  style={{ flexShrink: 0 }} />
                    : <ChevronRight size={9}  style={{ flexShrink: 0 }} />
                  }
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {org.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-4)', flexShrink: 0 }}>
                    {org.user_count}
                  </span>
                </button>

                {/* User rows */}
                {isExpanded && (
                  <div style={{ paddingLeft: 14 }}>
                    {org.users.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-4)', padding: '2px 6px' }}>
                        No users
                      </div>
                    )}
                    {org.users.map(user => (
                      <div
                        key={user.id}
                        className="group"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 4px', borderRadius: 4 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {/* Online dot */}
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: user.online ? '#22c55e' : '#4b5563',
                        }} />

                        <span
                          title={user.full_name}
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: 'var(--text-2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {user.full_name}
                        </span>

                        {/* Profile icon */}
                        <button
                          onClick={() => router.push(`/users/${user.id}`)}
                          title="View profile"
                          style={{
                            ...rowBase,
                            width: 'auto',
                            padding: 2,
                            color: 'var(--text-4)',
                            borderRadius: 3,
                            opacity: 0,
                            transition: 'opacity 0.15s',
                          }}
                          className="group-hover:!opacity-100"
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                        >
                          <ExternalLink size={11} />
                        </button>

                        {/* Message icon */}
                        <button
                          onClick={() => initiateSupport(user.id, user.full_name)}
                          title="Start support chat"
                          style={{
                            ...rowBase,
                            width: 'auto',
                            padding: 2,
                            color: 'var(--text-4)',
                            borderRadius: 3,
                            opacity: 0,
                            transition: 'opacity 0.15s',
                          }}
                          className="group-hover:!opacity-100"
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                        >
                          <MessageCircle size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
