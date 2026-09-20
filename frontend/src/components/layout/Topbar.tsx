'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, Headphones, MessageCircle } from 'lucide-react';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { NotificationDropdown } from './NotificationDropdown';
import { ProfileDropdown }      from './ProfileDropdown';
import { useAuthStore }         from '@/store/useAuthStore';
import { useNotifications }     from '@/hooks/useNotifications';
import { useLogoSizeStore, resolveLH } from '@/store/useLogoSizeStore';
import { usePageTransition }    from '@/store/usePageTransition';
import { useChatStore }         from '@/store/useChatStore';
import { SupportPopup }         from '@/components/chat/SupportPopup';
import { AgentSupportPanel }    from '@/components/chat/AgentSupportPanel';
import { DMInboxPanel }         from '@/components/chat/DMInboxPanel';
import { NetaMateMark }         from '@/components/NetaMateMark';

const MSP_ROLES = new Set(['msp_owner', 'msp_manager', 'msp_agent']);

export function Topbar() {
  const router = useRouter();
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen,    setHelpOpen]    = useState(false);
  const [chatOpen,    setChatOpen]    = useState(false);
  const triggerTransition = usePageTransition((s) => s.trigger);

  const { user } = useAuthStore();
  const displayName = user?.full_name || 'User';
  const avatarColor = getAvatarColor(displayName);
  const initials    = getInitials(displayName);

  const { notifications, unreadCount, markRead, markAllRead, refetch } = useNotifications();
  const {
    mdIconSize,
    mdFontSize,
    mdLineHeight,
    mdCustomText,
    mdLogoUrl,
    mdLogoVariant,
    mdLogoThemeAware,
  } = useLogoSizeStore();

  const isAgent    = MSP_ROLES.has(user?.role ?? '');
  const dmUnread   = useChatStore((s) => s.dmUnreadTotal);
  const supportUnread = useChatStore((s) => s.supportUnreadTotal);
  const hasPendingInitiation = useChatStore((s) =>
    s.windows.some(
      (w) =>
        w.type === 'support' &&
        w.sessionStatus === 'waiting' &&
        w.messages.some((m) => m.body === '__AGENT_INITIATION__'),
    ),
  );
  const agentQueueCount = useChatStore((s) => {
    const dismissed = s.dismissedSessions;
    return s.incomingQueue.filter((q) => !dismissed.has(q.id)).length;
  });
  const helpDot = isAgent
    ? agentQueueCount > 0
    : supportUnread > 0 || hasPendingInitiation;

  return (
    <header
      className="flex items-center flex-shrink-0 w-full"
      style={{
        height:       44,
        background:   'var(--bg-surface)',
        borderBottom: '1px solid var(--border-md)',
        zIndex:       50,
        paddingRight: 16,
      }}
    >
      {/* Logo */}
      <button
        onClick={() => triggerTransition(() => router.push('/home'))}
        className="flex items-center"
        // The logo occupies the sidebar's column and carries its right border, so the
        // divider runs unbroken from the top of the viewport down the nav's edge.
        // Width tracks MainSidebar's expanded width; padding aligns the mark with
        // the nav icons below it.
        style={{
          width:       200,
          height:      '100%',
          padding:     '0 16px',
          background:  'none',
          border:      'none',
          borderRight: '1px solid var(--border-subtle)',
          cursor:      'pointer',
          flexShrink:  0,
          gap:         9,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      >
        <div style={{
          width: mdIconSize,
          height: mdIconSize,
          background: (mdLogoUrl || mdLogoVariant) ? 'transparent' : '#1F4ED8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'width 0.15s, height 0.15s',
          color: 'var(--text-0)',
        }}>
          {mdLogoVariant === 'netamate' ? (
            <NetaMateMark size={mdIconSize} />
          ) : mdLogoUrl && mdLogoThemeAware ? (
            <span
              aria-hidden="true"
              style={{
                width: mdIconSize,
                height: mdIconSize,
                display: 'block',
                background: 'var(--text-0)',
                WebkitMaskImage: `url("${mdLogoUrl}")`,
                maskImage: `url("${mdLogoUrl}")`,
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
              }}
            />
          ) : mdLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mdLogoUrl} width={mdIconSize} height={mdIconSize} alt="" style={{ objectFit: 'contain' }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" width={mdIconSize * 0.625} height={mdIconSize * 0.625}>
              <path d="M3 4h18v9.5l-4.5 0-1.8 2.5h-5.4l-1.8 -2.5h-4.5z" fill="#fff" />
              <path d="M3 13.5v6.5h18v-6.5" stroke="#fff" strokeWidth="1.5" fill="none" />
            </svg>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-hemi), sans-serif', fontWeight: 700, fontSize: mdFontSize, lineHeight: resolveLH(mdLineHeight), letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-1)', whiteSpace: 'nowrap', position: 'relative', top: -1, transition: 'font-size 0.15s' }}>
          {mdCustomText || <>Mate<span style={{ color: 'var(--accent-info-fg)' }}>Desk</span></>}
        </span>
      </button>

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">

        {/* Chat / DM icon — all users */}
        <div className="relative">
          <button
            onClick={() => { setChatOpen((o) => !o); setNotifOpen(false); setProfileOpen(false); setHelpOpen(false); }}
            className="relative flex items-center justify-center w-8 h-8 transition-colors"
            style={{
              color:      chatOpen ? '#818cf8' : 'var(--text-3)',
              background: chatOpen ? 'var(--bg-elevated)' : 'transparent',
            }}
            onMouseEnter={(e) => { if (!chatOpen) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
            onMouseLeave={(e) => { if (!chatOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; } }}
            aria-label="Messages"
          >
            <MessageCircle size={17} />
            {dmUnread > 0 && (
              <span
                className="absolute top-1 right-1 flex items-center justify-center text-white font-bold"
                style={{
                  width: 13, height: 13, fontSize: 8,
                  background: '#6366f1', borderRadius: '50%',
                  border: '1.5px solid var(--bg-surface)', lineHeight: 1,
                }}
              >
                {dmUnread > 9 ? '9+' : dmUnread}
              </span>
            )}
          </button>
          {chatOpen && <DMInboxPanel onClose={() => setChatOpen(false)} />}
        </div>

        {/* Help / Live Support icon — all users */}
        <div className="relative">
          <button
            onClick={() => { setHelpOpen((o) => !o); setNotifOpen(false); setProfileOpen(false); setChatOpen(false); }}
            className="relative flex items-center justify-center w-8 h-8 transition-colors"
            style={{
              color:      helpOpen ? '#c4b5fd' : 'var(--text-3)',
              background: helpOpen ? 'var(--bg-elevated)' : 'transparent',
            }}
            onMouseEnter={(e) => { if (!helpOpen) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
            onMouseLeave={(e) => { if (!helpOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; } }}
            aria-label="Live Support"
          >
            <Headphones size={17} />
            {helpDot && (
              <span
                className="absolute top-1 right-1"
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: isAgent ? '#f59e0b' : '#a78bfa',
                  border: '1.5px solid var(--bg-surface)',
                }}
              />
            )}
          </button>
          {helpOpen && (
            isAgent
              ? <AgentSupportPanel onClose={() => setHelpOpen(false)} />
              : <SupportPopup onClose={() => setHelpOpen(false)} />
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(o => !o); setProfileOpen(false); setHelpOpen(false); setChatOpen(false); }}
            className="relative flex items-center justify-center w-8 h-8 transition-colors"
            style={{
              color:      notifOpen ? '#93c5fd' : 'var(--text-3)',
              background: notifOpen ? 'var(--bg-elevated)'  : 'transparent',
            }}
            onMouseEnter={e => { if (!notifOpen) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
            onMouseLeave={e => { if (!notifOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; } }}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 flex items-center justify-center text-white font-bold"
                style={{
                  width: 13, height: 13, fontSize: 8,
                  background: '#2563eb', borderRadius: '50%',
                  border: '1.5px solid var(--bg-surface)', lineHeight: 1,
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <NotificationDropdown
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
              onRefetch={refetch}
              onClose={() => setNotifOpen(false)}
            />
          )}
        </div>

        <div className="h-5 mx-1" style={{ width: 1, background: 'var(--border-md)' }} />

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); setHelpOpen(false); setChatOpen(false); }}
            className="flex items-center gap-1.5 px-1.5 py-1 transition-colors"
            style={{ background: profileOpen ? 'var(--bg-elevated)' : 'transparent' }}
            onMouseEnter={e => { if (!profileOpen) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
            onMouseLeave={e => { if (!profileOpen) e.currentTarget.style.background = 'transparent'; }}
            aria-label="Profile menu"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold text-white flex-shrink-0"
              style={{ background: avatarColor }}
            >
              {initials}
            </div>
            <ChevronDown
              size={11}
              style={{ color: 'var(--text-4)', transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            />
          </button>
          {profileOpen && <ProfileDropdown onClose={() => setProfileOpen(false)} />}
        </div>
      </div>
    </header>
  );
}
