'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, Bell, RefreshCw, Ticket, UserCheck, MessageSquare } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { ApiNotification } from '@/hooks/useNotifications';

interface Props {
  notifications: ApiNotification[];
  unreadCount:   number;
  onMarkRead:    (id: string) => void;
  onMarkAllRead: () => void;
  onRefetch:     () => void;
  onClose:       () => void;
}

function groupByDay(notifications: ApiNotification[]) {
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: ApiNotification[] }[] = [];
  const buckets: Record<string, ApiNotification[]> = {};

  for (const n of notifications) {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
    let key: string;
    if (d.getTime() === today.getTime())          key = 'TODAY';
    else if (d.getTime() === yesterday.getTime()) key = 'YESTERDAY';
    else key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (!buckets[key]) { buckets[key] = []; groups.push({ label: key, items: buckets[key] }); }
    buckets[key].push(n);
  }
  return groups;
}

function NotifIcon({ type }: { type: ApiNotification['notif_type'] }) {
  const s = { size: 14, style: { flexShrink: 0 } as React.CSSProperties };
  if (type === 'new_ticket')  return <Ticket      {...s} style={{ ...s.style, color: 'var(--accent-info-fg)' }} />;
  if (type === 'assigned')    return <UserCheck   {...s} style={{ ...s.style, color: 'var(--accent-ok-fg)' }} />;
  if (type === 'new_reply')   return <MessageSquare {...s} style={{ ...s.style, color: 'var(--accent-violet-fg)' }} />;
  return <Bell {...s} style={{ ...s.style, color: 'var(--accent-info-fg)' }} />;
}

export function NotificationDropdown({ notifications, unreadCount, onMarkRead, onMarkAllRead, onRefetch, onClose }: Props) {
  const router = useRouter();
  const groups = groupByDay(notifications);

  function handleNotifClick(notif: ApiNotification) {
    onMarkRead(notif.id);
    if (notif.ticket_ref) {
      router.push(`/requests/${notif.ticket_ref}`);
      onClose();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(0,0,0,0.45)',
        }}
      />

      {/* Slide-in panel */}
      <div
        className="animate-slide-right"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 340, zIndex: 200,
          background: 'var(--bg-deep)',
          borderLeft: '1px solid var(--border-panel)',
          boxShadow: 'var(--shadow-panel)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 16px', height: 48, flexShrink: 0,
            borderBottom: '1px solid var(--border-panel)',
          }}
        >
          <Bell size={14} style={{ color: 'var(--accent-indigo-fg)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', flex: 1 }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: 10, fontWeight: 700, lineHeight: '16px',
                padding: '0 6px', background: '#2563eb', color: '#fff',
                borderRadius: 8, marginRight: 4,
              }}
            >
              {unreadCount}
            </span>
          )}
          <button
            onClick={onRefetch}
            title="Refresh"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
              <Bell size={28} style={{ color: 'var(--border-panel)' }} />
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No notifications</span>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                <div
                  style={{
                    padding: '8px 16px 6px',
                    fontSize: 10, fontWeight: 700,
                    color: 'var(--text-3)', letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid #111527',
                  }}
                >
                  {group.label}
                </div>

                {group.items.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      width: '100%', padding: '12px 16px', textAlign: 'left',
                      background: notif.is_read ? 'transparent' : 'rgba(99,102,241,0.04)',
                      borderBottom: '1px solid #111527', borderLeft: 'none', borderRight: 'none', borderTop: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#111527'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = notif.is_read ? 'transparent' : 'rgba(99,102,241,0.04)'; }}
                  >
                    <div style={{ marginTop: 2, flexShrink: 0 }}>
                      <NotifIcon type={notif.notif_type} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 13, fontWeight: notif.is_read ? 400 : 600,
                            color: notif.is_read ? 'var(--text-4)' : 'var(--text-0)',
                            display: 'block',
                          }}
                        >
                          {notif.message}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>
                      {notif.ticket_ref && (
                        <span style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'block' }}>
                          {notif.ticket_ref}
                        </span>
                      )}
                    </div>
                    {!notif.is_read && (
                      <div
                        style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: '#6366f1', flexShrink: 0, marginTop: 5,
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {unreadCount > 0 && (
          <div style={{ borderTop: '1px solid var(--border-panel)', padding: '10px 16px' }}>
            <button
              onClick={onMarkAllRead}
              style={{
                width: '100%', padding: '8px',
                fontSize: 12, color: 'var(--accent-indigo-fg)',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
            >
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </>
  );
}
