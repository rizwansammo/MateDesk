'use client';

import Link from 'next/link';
import {
  Building2, Mail, Users, Shield, Sliders, Palette, BookOpen, Bell,
  ChevronRight, Users2, Clock, Zap, DollarSign,
} from 'lucide-react';

interface SettingsLink  { label: string; href: string; }
interface SettingsGroup {
  icon:  React.ElementType;
  title: string;
  desc:  string;
  color: string;
  links: SettingsLink[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    icon:  Building2,
    title: 'MSP Details',
    desc:  'Organization info & email signature',
    color: 'var(--accent-info-fg)',
    links: [
      { label: 'Organization Details', href: '/settings/organization'    },
      { label: 'Email Signature',      href: '/settings/email-signature' },
    ],
  },
  {
    icon:  Users,
    title: 'Clients',
    desc:  'Manage client organizations, users and business hours',
    color: 'var(--accent-violet-fg)',
    links: [
      { label: 'Organizations',  href: '/settings/organizations' },
      { label: 'Client Users',   href: '/settings/client-users'  },
      { label: 'Business Hours', href: '/settings/organizations' },
    ],
  },
  {
    icon:  Mail,
    title: 'Mail Server',
    desc:  'Email protocol & delivery settings',
    color: '#06b6d4',
    links: [
      { label: 'Mail Protocol', href: '/settings/email' },
    ],
  },
  {
    icon:  Users2,
    title: 'Resources & Groups',
    desc:  'Staff members and support team groups',
    color: 'var(--accent-ok-fg)',
    links: [
      { label: 'Staff Members',   href: '/settings/staff'          },
      { label: 'Support Groups',  href: '/settings/support-groups' },
    ],
  },
  {
    icon:  Clock,
    title: 'SLA',
    desc:  'Response targets, breach rules & VIP notifications',
    color: 'var(--accent-warn-fg)',
    links: [
      { label: 'SLA Policies', href: '/settings/sla/policies'  },
      { label: 'VIP Rules',    href: '/settings/sla/vip-rules' },
    ],
  },
  {
    icon:  Palette,
    title: 'Appearance',
    desc:  'Interface zoom & display preferences',
    color: 'var(--accent-orange-fg)',
    links: [
      { label: 'Interface Zoom',   href: '/settings/appearance' },
      { label: 'Tickets per Page', href: '/settings/appearance' },
    ],
  },
  {
    icon:  Sliders,
    title: 'General Settings',
    desc:  'Timezone, locale & ticket categories',
    color: 'var(--text-3)',
    links: [
      { label: 'Timezone & Locale',  href: '/settings' },
      { label: 'Ticket Categories',  href: '/settings' },
    ],
  },
  {
    icon:  Shield,
    title: 'Security & Access',
    desc:  'Permissions, 2FA & API access',
    color: 'var(--accent-danger-fg)',
    links: [
      { label: 'Role Permissions', href: '/settings' },
      { label: 'Two-Factor Auth',  href: '/settings' },
      { label: 'API Keys',         href: '/settings' },
    ],
  },
  {
    icon:  Bell,
    title: 'Notifications',
    desc:  'Rules, announcements & reminders',
    color: 'var(--accent-ok-fg)',
    links: [
      { label: 'Notification Rules', href: '/settings/notifications' },
      { label: 'Announcements',      href: '/settings/notifications' },
      { label: 'Reminders',          href: '/settings/notifications' },
    ],
  },
  {
    icon:  BookOpen,
    title: 'Templates & Automation',
    desc:  'Reply templates & workflow rules',
    color: 'var(--accent-violet-fg)',
    links: [
      { label: 'Canned Responses', href: '/settings/canned-responses' },
      { label: 'Business Rules',   href: '/settings' },
      { label: 'Custom Triggers',  href: '/settings' },
    ],
  },
  {
    icon:  Zap,
    title: 'Automation',
    desc:  'Pre-built templates & custom IF → THEN ticket rules',
    color: 'var(--accent-warn-fg)',
    links: [
      { label: 'Pre-Built Rules', href: '/settings/automation/prebuilt' },
      { label: 'Custom Rules',    href: '/settings/automation/rules'    },
      { label: 'Activity Logs',   href: '/settings/automation/logs'     },
    ],
  },
  {
    icon:  DollarSign,
    title: 'Billing',
    desc:  'Client rates, invoicing & payment tracking',
    color: 'var(--accent-warn-fg)',
    links: [
      { label: 'Company Info', href: '/settings/billing/company'  },
      { label: 'Client Rates', href: '/settings/billing/rates'    },
      { label: 'Invoices',     href: '/settings/billing/invoices' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Page header */}
      <div style={{
        flexShrink: 0,
        padding: '12px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>Admin Settings</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-4)', marginTop: '1px' }}>
          Configure your workspace, team, and platform preferences.
        </div>
      </div>

      {/* Card grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}>
          {SETTINGS_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div
                key={group.title}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '150px',
                }}
              >
                {/* Card header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '13px 14px 11px',
                  background: 'var(--bg-card)',
                  borderBottom: '1px solid var(--border-md)',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: '30px',
                    height: '30px',
                    background: `${group.color}18`,
                    border: `1px solid ${group.color}35`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={14} strokeWidth={1.8} style={{ color: group.color }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: 'var(--text-1)',
                      lineHeight: 1.2,
                    }}>
                      {group.title}
                    </div>
                    <div style={{
                      fontSize: '10.5px',
                      color: 'var(--text-4)',
                      marginTop: '2px',
                      lineHeight: 1.3,
                    }}>
                      {group.desc}
                    </div>
                  </div>
                </div>

                {/* Links */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {group.links.map((link, li) => (
                    <SettingsLinkRow
                      key={link.label}
                      href={link.href}
                      label={link.label}
                      isLast={li === group.links.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsLinkRow({
  href, label, isLast,
}: { href: string; label: string; isLast: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 14px',
        fontSize: '12px',
        color: 'var(--text-3)',
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
        textDecoration: 'none',
        transition: 'background 0.12s, color 0.12s',
        gap: '8px',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.background = 'var(--bg-hover)';
        el.style.color = 'var(--text-1)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.background = '';
        el.style.color = 'var(--text-3)';
      }}
    >
      <span>{label}</span>
      <ChevronRight size={11} style={{ opacity: 0.35, flexShrink: 0 }} />
    </Link>
  );
}
