'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarDays, Download, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  useProjectReport, useProjectTimeline, type ProjectReport, type ProjectTimeline,
} from '@/hooks/useProjectInsights';
import { ProjectError, ProjectLoading } from './ProjectUI';
import { encodeCsv } from '@/lib/csv';

function asHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

function stat(label: string, value: string | number) {
  return <div className="border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
    <div className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</div>
    <div className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-0)' }}>{value}</div>
  </div>;
}

function saveCsv(name: string, rows: string[][]) {
  const data = encodeCsv(rows);
  const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportReport(report: ProjectReport) {
  const rows = [
    ['Section', 'Item', 'Value'],
    ['Project', 'Name', report.project_name],
    ['Project', 'As Of', report.as_of],
    ['Work Items', 'Total', String(report.work_items.total)],
    ['Work Items', 'Completed', String(report.work_items.done)],
    ['Work Items', 'Overdue', String(report.work_items.overdue)],
    ['Work Items', 'Completion Percent', String(report.work_items.completion_percent)],
    ['Milestones', 'Total', String(report.milestones.total)],
    ['Milestones', 'Completed', String(report.milestones.completed)],
    ...report.status_distribution.map(x => ['Status', x.status, String(x.count)]),
    ...report.priority_distribution.map(x => ['Priority', x.priority, String(x.count)]),
  ];
  if (report.time) {
    rows.push(['Time', 'Tracked Minutes', String(report.time.tracked_minutes)]);
    rows.push(['Time', 'Billable Minutes', String(report.time.billable_minutes)]);
  }
  if (report.team) {
    report.team.forEach(row => {
      rows.push(['Team', row.name, `${row.completed}/${row.assigned} completed, ${row.tracked_minutes} tracked minutes`]);
    });
  }
  saveCsv(`${report.project_key}-report.csv`, rows);
}

function Distribution({ rows, valueKey }: {
  rows: { label: string; count: number }[];
  valueKey: string;
}) {
  const max = Math.max(1, ...rows.map(row => row.count));
  return <div className="space-y-2">
    {rows.map(row => <div key={row.label} className="grid grid-cols-[100px_1fr_35px] items-center gap-2 text-xs">
      <span className="truncate capitalize" style={{ color: 'var(--text-2)' }}>
        {row.label.replaceAll('_', ' ')}
      </span>
      <div className="h-2" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full" style={{
          background: 'var(--accent-info-fg)', width: `${row.count / max * 100}%`,
        }}/>
      </div>
      <span className="text-right font-mono" style={{ color: 'var(--text-3)' }}>{row.count}</span>
    </div>)}
    {!rows.length && <p className="text-xs" style={{ color: 'var(--text-3)' }}>No {valueKey} available.</p>}
  </div>;
}

export function ProjectReportsPanel({ projectId }: { projectId: string }) {
  const query = useProjectReport(projectId);
  if (query.isLoading) return <ProjectLoading text="Calculating Project reports…"/>;
  if (query.isError || !query.data) return <ProjectError error={query.error}
    retry={() => void query.refetch()}/>;
  const report = query.data;
  return <div className="space-y-3">
    <section className="panel">
      <div className="panel-header flex-wrap gap-2">
        <div>
          <h2 className="panel-title inline-flex items-center gap-2">
            <BarChart3 size={15}/> Project Reports
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Live metrics as of {report.as_of}. {report.is_client_view ? 'Shared Project information only.' : 'Based on current Project records.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={() => void query.refetch()}>
            <RefreshCw size={13}/> Refresh
          </button>
          <button type="button" className="btn-secondary text-xs"
            onClick={() => exportReport(report)}><Download size={13}/> Export CSV</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
        {stat('Work Items', report.work_items.total)}
        {stat('Completed', report.work_items.done)}
        {stat('Completion', `${report.work_items.completion_percent}%`)}
        {stat('Overdue Work', report.work_items.overdue)}
        {stat('Milestones', report.milestones.total)}
        {stat('Milestones Done', report.milestones.completed)}
        {stat('Milestones Overdue', report.milestones.overdue)}
        {stat('In Progress', report.work_items.active)}
      </div>
    </section>
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <section className="panel">
        <div className="panel-header"><h3 className="panel-title">Work by Status</h3></div>
        <div className="p-4"><Distribution valueKey="status"
          rows={report.status_distribution.map(row => ({ label: row.status, count: row.count }))}/></div>
      </section>
      <section className="panel">
        <div className="panel-header"><h3 className="panel-title">Work by Priority</h3></div>
        <div className="p-4"><Distribution valueKey="priority"
          rows={report.priority_distribution.map(row => ({ label: row.priority, count: row.count }))}/></div>
      </section>
    </div>
    {report.time && <section className="panel">
      <div className="panel-header">
        <h3 className="panel-title">Tracked Effort {report.time.scope === 'own' ? '(Your Time)' : '(Project Team)'}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3">
        {stat('Tracked Hours', asHours(report.time.tracked_minutes))}
        {stat('Billable', asHours(report.time.billable_minutes))}
        {stat('Non Billable', asHours(report.time.non_billable_minutes))}
        {report.effort && stat('Estimated Hours', asHours(report.effort.estimated_minutes))}
        {report.effort && stat('Variance', asHours(report.effort.variance_minutes))}
      </div>
    </section>}
    {report.team && <section className="panel">
      <div className="panel-header"><h3 className="panel-title">Team Workload</h3></div>
      {!report.team.length ? <p className="p-5 text-xs" style={{ color: 'var(--text-3)' }}>No assigned staff effort yet.</p> :
        <div className="overflow-x-auto"><table className="data-table w-full">
          <thead><tr><th>Staff Member</th><th>Assigned</th><th>Completed</th><th>Overdue</th><th>Estimated</th><th>Tracked</th></tr></thead>
          <tbody>{report.team.map(member => <tr key={member.staff_id}>
            <td>{member.name}</td><td>{member.assigned}</td>
            <td>{member.completed}</td><td>{member.overdue}</td>
            <td>{asHours(member.estimated_minutes)}</td>
            <td>{asHours(member.tracked_minutes)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>}
  </div>;
}

function utc(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}
const DAY = 86400000;

function dateAxis(timeline: ProjectTimeline) {
  const dates = [
    timeline.start_date, timeline.due_date, timeline.as_of,
    ...timeline.milestones.flatMap(row => [row.start_date, row.due_date]),
    ...timeline.work_items.flatMap(row => [row.start_date, row.due_date]),
  ].filter((value): value is string => Boolean(value)).map(utc);
  if (!dates.length) {
    const now = utc(timeline.as_of);
    return { start: now - 14 * DAY, end: now + 45 * DAY };
  }
  return { start: Math.min(...dates) - 7 * DAY, end: Math.max(...dates) + 7 * DAY };
}

export function ProjectTimelinePanel({ projectId }: { projectId: string }) {
  const query = useProjectTimeline(projectId);
  const [scale, setScale] = useState<'compact' | 'detailed'>('compact');
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const rows = useMemo(() => {
    const data = query.data;
    if (!data) return [];
    const milestones = data.milestones.map(m => ({
      id: m.id, title: m.name, status: m.status, milestone: true,
      start_date: m.start_date, due_date: m.due_date, overdue: m.overdue,
      progress: m.progress_percent, href: null as string | null,
      dependencies: [] as string[],
    }));
    const items = data.work_items.map(w => ({
      id: w.id, title: `${w.ref}: ${w.title}`, status: w.status,
      milestone: false, start_date: w.start_date, due_date: w.due_date,
      overdue: w.overdue, progress: w.status === 'done' ? 100 : 0,
      href: `/projects/${projectId}/work-items/${w.id}` as string | null,
      dependencies: w.dependencies,
    }));
    return [...milestones, ...items];
  }, [query.data, projectId]);
  if (query.isLoading) return <ProjectLoading text="Loading Project timeline…"/>;
  if (query.isError || !query.data) return <ProjectError error={query.error}
    retry={() => void query.refetch()}/>;
  const axis = dateAxis(query.data);
  const pixelsPerDay = scale === 'compact' ? 5 : 12;
  const days = Math.max(1, Math.ceil((axis.end - axis.start) / DAY));
  const width = days * pixelsPerDay;
  const ticks: { date: Date; left: number }[] = [];
  const from = new Date(axis.start);
  const current = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  if (current.getTime() < axis.start) current.setUTCMonth(current.getUTCMonth() + 1);
  for (let index = 0; current.getTime() <= axis.end && index < 180; index += 1) {
    ticks.push({ date: new Date(current), left: (current.getTime() - axis.start) / DAY * pixelsPerDay });
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  const active = showUnscheduled ? rows :
    rows.filter(row => row.start_date || row.due_date);
  const nowLeft = (utc(query.data.as_of) - axis.start) / DAY * pixelsPerDay;

  return <section className="panel">
    <div className="panel-header flex-wrap gap-2">
      <div>
        <h2 className="panel-title inline-flex items-center gap-2">
          <CalendarDays size={15}/> Project Timeline
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
          Read only Gantt view with scheduled milestones and Work Items.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
          <input type="checkbox" checked={showUnscheduled}
            onChange={e => setShowUnscheduled(e.target.checked)}/>
          Unscheduled
        </label>
        <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
          onClick={() => setScale('compact')} disabled={scale === 'compact'}>
          <ZoomOut size={13}/> Compact
        </button>
        <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs"
          onClick={() => setScale('detailed')} disabled={scale === 'detailed'}>
          <ZoomIn size={13}/> Detailed
        </button>
        <button type="button" className="btn-secondary text-xs"
          onClick={() => void query.refetch()}><RefreshCw size={13}/> Refresh</button>
      </div>
    </div>
    <div className="overflow-x-auto" role="region" aria-label="Project Gantt chart" tabIndex={0}>
      <div style={{ minWidth: 270 + width, position: 'relative' }}>
        <div className="sticky top-0 z-10 flex h-11 border-b"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <div className="w-[270px] min-w-[270px] border-r px-3 py-3 text-xs font-semibold"
            style={{ borderColor: 'var(--border-subtle)' }}>Milestones & Work Items</div>
          <div className="relative flex-1" style={{ width }}>
            {ticks.map(tick => <span key={tick.date.toISOString()} className="absolute top-3 text-xs"
              style={{ left: tick.left + 4, color: 'var(--text-3)' }}>
              {tick.date.toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
            </span>)}
          </div>
        </div>
        {!active.length && <p className="p-6 text-xs" style={{ color: 'var(--text-3)' }}>No scheduled work yet.</p>}
        {active.map(row => {
          const startDate = row.start_date || row.due_date;
          const endDate = row.due_date || row.start_date;
          const start = startDate ? (utc(startDate) - axis.start) / DAY * pixelsPerDay : 0;
          const span = startDate && endDate ? Math.max(pixelsPerDay, ((utc(endDate) - utc(startDate)) / DAY + 1) * pixelsPerDay) : 0;
          return <div key={row.id} className="flex h-11 border-b"
            style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex w-[270px] min-w-[270px] items-center gap-2 overflow-hidden border-r px-3"
              style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: row.overdue ? 'var(--accent-danger-fg)' : 'var(--text-2)' }}>
                {row.milestone ? '◆' : '•'}
              </span>
              {row.href ? <Link href={row.href} className="truncate text-xs hover:underline"
                style={{ color: 'var(--text-1)' }} title={row.title}>{row.title}</Link> :
                <span className="truncate text-xs font-medium" style={{ color: 'var(--text-1)' }}
                  title={row.title}>{row.title}</span>}
            </div>
            <div className="relative flex-1" style={{ width }}>
              {ticks.map(tick => <div key={tick.date.toISOString()} className="pointer-events-none absolute h-full border-l"
                style={{ left: tick.left, borderColor: 'var(--border-subtle)' }}/>)}
              {nowLeft >= 0 && nowLeft <= width && <div className="pointer-events-none absolute z-10 h-full border-l-2"
                style={{ left: nowLeft, borderColor: 'var(--accent-warn-fg)' }}/>}
              {startDate && endDate ? <div className="absolute top-[13px] h-[17px] overflow-hidden"
                title={`${row.title} · ${startDate} to ${endDate}${row.dependencies.length ? ` · ${row.dependencies.length} prerequisites` : ''}`}
                style={{
                  left: start, width: span, minWidth: 4,
                  background: row.overdue ? 'var(--accent-danger-fg)' :
                    row.milestone ? 'var(--accent-ok-fg)' : 'var(--accent-info-fg)',
                  opacity: 0.86,
                }}>
                <div className="h-full" style={{ background: 'rgba(255,255,255,0.3)',
                  width: `${Math.min(100, row.progress)}%` }}/>
              </div> :
                <span className="absolute left-3 top-3 text-[11px]"
                  style={{ color: 'var(--text-3)' }}>Unscheduled</span>}
            </div>
          </div>;
        })}
      </div>
    </div>
    <p className="border-t p-3 text-[11px]" style={{
      color: 'var(--text-3)', borderColor: 'var(--border-subtle)',
    }}>Bars show planned dates, not automatic task rescheduling. Orange vertical line marks today. Overdue rows are highlighted.</p>
  </section>;
}
