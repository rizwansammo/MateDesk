'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { X, User, CheckSquare, Wrench, Shield, LogOut, Wifi, Sun, Moon } from 'lucide-react';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { useAuthStore, getLogoutUrl } from '@/store/useAuthStore';
import { TransitionLink } from '@/components/TransitionLink';
import { usePageTransition } from '@/store/usePageTransition';

interface Props {
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  msp_owner:    'MSP Owner',
  msp_manager:  'MSP Manager',
  msp_agent:    'MSP Agent',
  client_owner: 'Client Owner',
  end_user:     'End User',
};

const MSP_MENU_ITEMS = [
  { icon: User,        label: 'My Profile', href: '/profile'            },
  { icon: CheckSquare, label: 'My Tasks',   href: '/tasks'              },
  { icon: Wrench,      label: 'Tools',      href: '#'                   },
  { icon: Shield,      label: 'Security',   href: '/settings/security'  },
];

const CLIENT_MENU_ITEMS = [
  { icon: User,        label: 'My Profile', href: '/profile' },
  { icon: CheckSquare, label: 'My Tasks',   href: '/tasks'   },
];

export function ProfileDropdown({ onClose }: Props) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const triggerTransition = usePageTransition((s) => s.trigger);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const displayName  = user?.full_name || 'User';
  const displayEmail = user?.email     || '';
  const displayRole  = ROLE_LABELS[user?.role ?? ''] || user?.role || 'Agent';
  const initials     = getInitials(displayName);
  const avatarColor  = getAvatarColor(displayName);
  const isMSP = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');
  const menuItems = isMSP ? MSP_MENU_ITEMS : CLIENT_MENU_ITEMS;

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
          width: 280, zIndex: 200,
          background: 'var(--bg-deep)',
          borderLeft: '1px solid var(--border-panel)',
          boxShadow: 'var(--shadow-panel)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-4)', border: '1px solid var(--border-panel)',
            background: 'transparent', cursor: 'pointer', zIndex: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <X size={13} />
        </button>

        {/* User info block */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '48px 24px 24px',
            borderBottom: '1px solid var(--border-panel)',
          }}
        >
          <div
            style={{
              width: 68, height: 68, borderRadius: '50%',
              background: avatarColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, color: '#fff',
              marginBottom: 14,
              border: '3px solid rgba(255,255,255,0.06)',
            }}
          >
            {initials}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)', marginBottom: 4, textAlign: 'center' }}>
            {displayName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 14, textAlign: 'center' }}>
            {displayEmail}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11, fontWeight: 600,
                padding: '3px 10px',
                background: 'rgba(37,99,235,0.15)', color: 'var(--accent-info-fg)',
                border: '1px solid rgba(37,99,235,0.25)',
              }}
            >
              {displayRole}
            </span>
            <span
              style={{
                fontSize: 11, fontWeight: 600,
                padding: '3px 10px',
                background: 'rgba(16,185,129,0.12)', color: 'var(--accent-ok-fg)',
                border: '1px solid rgba(16,185,129,0.2)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Wifi size={10} /> Online
            </span>
          </div>
        </div>

        {/* Menu items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {menuItems.map(item => (
            <TransitionLink
              key={item.href}
              href={item.href}
              color="blue"
              onNavigate={onClose}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 20px',
                fontSize: 13, color: 'var(--text-2)',
                textDecoration: 'none',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)';
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-0)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)';
              }}
            >
              <item.icon size={15} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
              {item.label}
            </TransitionLink>
          ))}

          {/* Theme toggle row */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 20px',
              borderTop: '1px solid var(--border-panel)',
              marginTop: 4,
            }}
          >
            <div className="flex items-center gap-3">
              {isDark
                ? <Moon size={15} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                : <Sun  size={15} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
              }
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
            {/* Toggle switch — ON (blue) = dark mode active */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              style={{
                width: 42, height: 22, borderRadius: 11, position: 'relative',
                background: isDark ? '#2563eb' : 'var(--bg-elevated)',
                border: '1px solid var(--border-md)',
                cursor: 'pointer', transition: 'background 0.2s',
                flexShrink: 0,
              }}
              aria-label="Toggle theme"
            >
              <span
                style={{
                  position: 'absolute', top: 2,
                  left: isDark ? 22 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: isDark ? '#fff' : 'var(--text-3)',
                  transition: 'left 0.2s',
                  display: 'block',
                }}
              />
            </button>
          </div>
        </nav>

        {/* Sign out */}
        <div style={{ borderTop: '1px solid var(--border-panel)', padding: '6px 0' }}>
          <button
            onClick={() => {
              logout();
              onClose();
              // Use window.location for cross-origin navigation to root domain.
              // router.push() only works same-origin; getLogoutUrl() returns
              // https://matedesk.pro/logout-complete in production (or /login in dev).
              window.location.href = getLogoutUrl();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '11px 20px',
              fontSize: 13, color: 'var(--accent-danger-fg)',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <LogOut size={15} style={{ flexShrink: 0 }} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
