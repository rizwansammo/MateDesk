'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  TrendingUp, Users, AlertTriangle, Clock,
  CheckCircle, XCircle, Activity, RefreshCw, Plus,
} from 'lucide-react';
import { RequestSummaryChart } from '@/components/charts/RequestSummaryChart';
import { PriorityDonutChart }  from '@/components/charts/PriorityDonutChart';
import {
  useTicketStats, useAgentStats, useRecentActivity, useVolumeByDay,
} from '@/hooks/useTickets';

const ROLE_LABELS: Record<string, string> = {
  msp_owner: 'Owner', msp_manager: 'Manager', msp_agent: 'Agent',
};

const TYPE_COLORS: Record<string, string> = {
  public_reply: '#60a5fa', internal_note: '#fbbf24', system_event: '#64748b',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<'today' | 'this_week' | 'this_month'>('this_month');

  const { data: stats,    refetch: refetchStats }    = useTicketStats();
  const { data: agents }                              = useAgentStats();
  const { data: activity, refetch: refetchActivity } = useRecentActivity();
  const { data: volume }                              = useVolumeByDay();

  const statCards = [
    { label: 'Total Open',     value: stats?.total_open     ?? 0, color: 'var(--accent-info-fg)', icon: TrendingUp   },
    { label: 'Unassigned',     value: stats?.unassigned     ?? 0, color: 'var(--text-3)', icon: Users        },
    { label: 'Overdue',        value: stats?.overdue        ?? 0, color: 'var(--accent-danger-fg)', icon: AlertTriangle },
    { label: 'Waiting Client', value: stats?.waiting_client ?? 0, color: 'var(--accent-orange-fg)', icon: Clock        },
    { label: 'Resolved Today', value: stats?.solved_today   ?? 0, color: 'var(--accent-ok-fg)', icon: CheckCircle  },
    { label: 'Closed',         value: stats?.closed         ?? 0, color: 'var(--text-3)', icon: XCircle      },
  ];

  const priorityData = [
    { name: 'Normal',   value: stats?.priority_breakdown?.normal   ?? 0, color: 'var(--accent-info-fg)' },
    { name: 'Low',      value: stats?.priority_breakdown?.low      ?? 0, color: 'var(--accent-ok-fg)' },
    { name: 'High',     value: stats?.priority_breakdown?.high     ?? 0, color: 'var(--accent-warn-fg)' },
    { name: 'Critical', value: stats?.priority_breakdown?.critical ?? 0, color: 'var(--accent-danger-fg)' },
  ];

  const unassigned = stats?.unassigned   ?? 0;
  const totalOpen  = stats?.total_open   ?? 0;
  const ratio      = totalOpen > 0 ? Math.round((unassigned / totalOpen) * 100) : 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Secondary bar ────────────────────────────────────────────────── */}
      <div className="secondary-bar">
        <div className="flex items-center gap-0.5 text-xs">
          {(['Helpdesk', 'Problem & Change', 'Assets'] as const).map((tab, i) => (
            <button
              key={tab}
              className="px-2.5 py-1 text-xs font-medium transition-colors"
              style={{ color: i === 0 ? 'var(--text-1)' : 'var(--text-4)', background: i === 0 ? 'var(--bg-elevated)' : 'transparent' }}
              onMouseEnter={e => { if (i !== 0) (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
              onMouseLeave={e => { if (i !== 0) (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(['All Sites', 'All Support Groups'] as const).map(opt => (
            <div key={opt} className="relative">
              <select className="select h-7 text-xs py-0" style={{ minWidth: 120, fontSize: '0.72rem', background: 'var(--bg-card)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}>
                <option>{opt}</option>
              </select>
            </div>
          ))}
          <div className="relative">
            <select
              className="select h-7 text-xs py-0"
              style={{ minWidth: 110, fontSize: '0.72rem', background: 'var(--bg-card)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
              value={period}
              onChange={e => setPeriod(e.target.value as typeof period)}
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
            </select>
          </div>
          <button className="btn-primary gap-1" style={{ height: 28, paddingTop: 0, paddingBottom: 0, fontSize: 11 }}>
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-3 space-y-3">

        {/* Stat cards */}
        <div className="grid grid-cols-6 gap-2">
          {statCards.map(({ label, value, color, icon: Icon }) => (
            <div
              key={label}
              className="panel cursor-pointer transition-colors"
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
            >
              <div style={{ width: 42, height: 42, background: color + '20', color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon size={22} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-hemi)', fontSize: 32, lineHeight: 1, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, marginTop: 4 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Row 2: Agent table + Chart */}
        <div className="grid grid-cols-12 gap-3">

          <div className="col-span-12 xl:col-span-5">
            <div className="panel h-full">
              <div className="panel-header">
                <span className="panel-title">Requests by Technician</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {['Technician', 'Open', 'Waiting Client', 'Overdue'].map(h => (
                        <th key={h} className={h !== 'Technician' ? 'text-right' : ''}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!agents || agents.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="py-8 text-center" style={{ fontSize: 12, color: 'var(--text-3)' }}>No technicians yet</div>
                        </td>
                      </tr>
                    ) : agents.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div>
                            <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{a.full_name}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 6 }}>{ROLE_LABELS[a.role] ?? a.role}</span>
                          </div>
                        </td>
                        <td className="text-right" style={{ color: 'var(--accent-info-fg)', fontWeight: 600 }}>{a.open}</td>
                        <td className="text-right" style={{ color: 'var(--accent-warn-fg)', fontWeight: 600 }}>{a.waiting_client}</td>
                        <td className="text-right" style={{ color: a.overdue > 0 ? '#f87171' : 'var(--text-3)', fontWeight: 600 }}>{a.overdue}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-md)', fontWeight: 600 }}>
                      <td style={{ color: 'var(--text-1)' }}>Total</td>
                      <td className="text-right" style={{ color: 'var(--accent-info-fg)' }}>{agents?.reduce((s, a) => s + a.open, 0) ?? 0}</td>
                      <td className="text-right" style={{ color: 'var(--accent-warn-fg)' }}>{agents?.reduce((s, a) => s + a.waiting_client, 0) ?? 0}</td>
                      <td className="text-right" style={{ color: 'var(--text-3)' }}>{agents?.reduce((s, a) => s + a.overdue, 0) ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="col-span-12 xl:col-span-7">
            <div className="panel h-full">
              <div className="panel-header">
                <span className="panel-title">Request Summary</span>
                <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                  {[{ color: 'var(--accent-info-fg)', label: 'Inbound' }, { color: 'var(--accent-ok-fg)', label: 'Completed' }].map(l => (
                    <span key={l.label} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <RequestSummaryChart data={volume ?? []} />
              </div>
            </div>
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-12 gap-3">

          <div className="col-span-12 lg:col-span-6 xl:col-span-5">
            <div className="panel h-full">
              <div className="panel-header">
                <span className="panel-title">Open Requests by Priority</span>
              </div>
              <div className="p-3 flex items-center gap-4">
                <PriorityDonutChart data={priorityData} />
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6 xl:col-span-4">
            <div className="panel h-full">
              <div className="panel-header">
                <span className="panel-title">SLA Violation by Priority</span>
              </div>
              <div className="p-4 empty-state">
                <AlertTriangle size={28} style={{ color: 'var(--border-md)', marginBottom: 8 }} />
                <p className="empty-state-text">No SLA violations at this time</p>
              </div>
            </div>
          </div>

          <div className="col-span-12 xl:col-span-3">
            <div className="panel h-full">
              <div className="panel-header">
                <span className="panel-title">Unassigned &amp; Open</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between p-3" style={{ background: 'var(--bg-surface)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Unassigned</span>
                  <span className="font-bold" style={{ fontSize: 20, color: 'var(--text-3)' }}>{unassigned}</span>
                </div>
                <div className="flex items-center justify-between p-3" style={{ background: 'var(--bg-surface)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Total Open</span>
                  <span className="font-bold" style={{ fontSize: 20, color: 'var(--accent-info-fg)' }}>{totalOpen}</span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                    <span>Unassigned ratio</span>
                    <span>{ratio}%</span>
                  </div>
                  <div className="h-2" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-2 transition-all" style={{ width: `${ratio}%`, background: '#94a3b8' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title flex items-center gap-1.5">
              <Activity size={13} style={{ color: 'var(--accent-info-fg)' }} />
              Activity Log
              <span className="px-1.5 py-0.5 font-semibold ml-1" style={{ fontSize: 9, background: 'rgba(37,99,235,0.15)', color: 'var(--accent-info-fg)', letterSpacing: '0.06em' }}>
                LIVE
              </span>
            </span>
            <button className="icon-btn w-7 h-7" title="Refresh" onClick={() => { refetchStats(); refetchActivity(); }}>
              <RefreshCw size={12} />
            </button>
          </div>

          {!activity || activity.length === 0 ? (
            <div className="py-10 text-center">
              <Activity size={24} style={{ color: 'var(--border-md)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No activity yet</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Activity will appear here once tickets are created.{' '}
                <Link href="/requests/new" className="text-[#60a5fa] hover:underline">Create your first ticket</Link>
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {activity.map(item => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <div
                    className="flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ width: 26, height: 26, borderRadius: '50%', background: TYPE_COLORS[item.type] + '28', fontSize: 10, color: TYPE_COLORS[item.type] ?? '#94a3b8' }}
                  >
                    {item.author.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{item.author}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent-info-fg)' }}>{item.ticket_ref}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{timeAgo(item.created_at)}</span>
                    </div>
                    <p className="truncate" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
