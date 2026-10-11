'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Home, LayoutDashboard, Ticket, CalendarDays, Calendar,
  Settings, ChevronLeft, ChevronRight, BookOpen,
  Users, UserCog, FolderKanban,
} from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/useAuthStore';
import { TransitionLink } from '@/components/TransitionLink';

interface NavItem  { label: string; href: string; icon: React.ElementType; }
interface NavGroup { title: string; items: NavItem[]; }

export function MainSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useAuthStore();

  const isMSP = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const NAV_GROUPS: NavGroup[] = isMSP
    ? [
        {
          title: 'WORKSPACE',
          items: [
            { label: 'Home',      href: '/home',      icon: Home            },
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          ],
        },
        {
          title: 'SUPPORT',
          items: [
            { label: 'Requests',       href: '/requests', icon: Ticket    },
            { label: 'Projects',       href: '/projects', icon: FolderKanban },
            { label: 'Events',         href: '/events',   icon: CalendarDays },
            { label: 'Calendar',       href: '/calendar', icon: Calendar  },
            { label: 'Knowledge Base', href: '/kb',       icon: BookOpen  },
          ],
        },
        {
          title: 'PEOPLE',
          items: [
            { label: 'Agents',  href: '/agents',  icon: UserCog },
            { label: 'Clients', href: '/clients', icon: Users   },
          ],
        },
        {
          title: 'CONFIGURATION',
          items: [
            { label: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ]
    : [
        {
          title: 'SUPPORT',
          items: [
            { label: 'Requests', href: '/requests', icon: Ticket },
            { label: 'My Projects', href: '/projects', icon: FolderKanban },
          ],
        },
        {
          title: 'PEOPLE',
          items: [
            { label: 'Users', href: '/users', icon: Users },
          ],
        },
      ];

  const collapseBtn = (
    <button
      onClick={() => setCollapsed(c => !c)}
      className="flex items-center justify-center w-5 h-5 flex-shrink-0 transition-colors"
      style={{ color: 'var(--text-4)' }}
      onMouseEnter={e => { e.currentTarget.style.color = '#93c5fd'; e.currentTarget.style.background = 'rgba(37,99,235,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
    </button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          width:       collapsed ? 52 : 200,
          height:      '100%',
          background:  'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden pt-2 pb-3 space-y-4">
          {NAV_GROUPS.map((group, groupIdx) => (
            <div key={group.title}>
              {collapsed ? (
                groupIdx === 0 && (
                  <div className="flex justify-center mb-1 mt-0.5">
                    {collapseBtn}
                  </div>
                )
              ) : (
                <div
                  className="flex items-center justify-between px-3.5 mb-1.5"
                  style={{ minHeight: 20 }}
                >
                  <span
                    className="font-bold uppercase tracking-widest"
                    style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.12em' }}
                  >
                    {group.title}
                  </span>
                  {groupIdx === 0 && collapseBtn}
                </div>
              )}

              <div className="space-y-0.5 px-1.5">
                {group.items.map(item => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/home' && pathname.startsWith(item.href));

                  const navItem = (
                    <TransitionLink
                      key={item.href}
                      href={item.href}
                      color="blue"
                      className="flex items-center gap-3 px-2.5 py-2 font-medium transition-all duration-100 select-none outline-none"
                      style={{
                        fontSize: 13,
                        background: isActive ? 'rgba(37,99,235,0.1)' : 'transparent',
                        color: isActive ? '#60a5fa' : 'var(--text-2)',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-0)'; } }}
                      onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; } }}
                    >
                      <item.icon
                        size={15}
                        style={{ flexShrink: 0, color: isActive ? '#60a5fa' : 'inherit' }}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </TransitionLink>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <div className="relative">{navItem}</div>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return navItem;
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
