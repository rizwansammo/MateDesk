'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useEvents, useUpdateEvent } from '@/hooks/useEvents';
import { useAuthStore } from '@/store/useAuthStore';
import type { CalendarEvent } from '@/types/events';

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOT_HEIGHT = 48;   // px per 30-min slot
const TIME_COL_W  = 60;   // px — fixed time-label column
const DAY_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const r   = new Date(d);
  const dow = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const s   = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e   = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}

function slotLabel(idx: number): string {
  const hour = Math.floor(idx / 2);
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h    = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h} ${ampm}`;
}

function getSlotIndex(dt: Date): number {
  return dt.getHours() * 2 + (dt.getMinutes() >= 30 ? 1 : 0);
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function eventColor(ev: CalendarEvent, now: Date) {
  if (ev.status === 'completed')
    return { accent: '#34d399', bg: 'var(--accent-ok-bg)', border: 'rgba(52,211,153,0.35)', text: 'var(--accent-ok-fg)' };
  if (new Date(ev.event_dt) < now)
    return { accent: '#f87171', bg: 'var(--accent-danger-bg)', border: 'rgba(248,113,113,0.35)', text: 'var(--accent-danger-fg)' };
  return { accent: '#fbbf24', bg: 'var(--accent-warn-bg)', border: 'rgba(251,191,36,0.35)', text: 'var(--accent-warn-fg)' };
}

// ── MiniCalendar ──────────────────────────────────────────────────────────────

interface MiniCalProps {
  weekStart: Date;
  onChange:  (d: Date) => void;
}

function MiniCalendar({ weekStart, onChange }: MiniCalProps) {
  const today     = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const weekEnd   = addDays(weekStart, 6);

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(weekStart);
    d.setDate(1); d.setHours(0,0,0,0);
    return d;
  });

  // Sync view month when week changes
  useEffect(() => {
    setViewMonth(m => {
      const ws = new Date(weekStart); ws.setDate(1); ws.setHours(0,0,0,0);
      return ws.getMonth() !== m.getMonth() || ws.getFullYear() !== m.getFullYear() ? ws : m;
    });
  }, [weekStart]);

  const daysInMonth  = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDow     = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const startOffset  = firstDow === 0 ? 6 : firstDow - 1; // offset to Monday
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const btnStyle: React.CSSProperties = {
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--text-4)', borderRadius: 4,
  };

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Month header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <button
          style={btnStyle}
          onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-4)'; }}
        >
          <ChevronLeft size={13} />
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
          {fmtMonthYear(viewMonth)}
        </span>
        <button
          style={btnStyle}
          onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-4)'; }}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* DOW labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {['M','T','W','T','F','S','S'].map((l, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', padding: '2px 0' }}>{l}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday   = isSameDay(day, today);
          const inWeek    = day >= weekStart && day <= weekEnd;
          return (
            <button
              key={i}
              onClick={() => onChange(day)}
              style={{
                width: '100%', aspectRatio: '1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: isToday ? 700 : 400,
                background: isToday
                  ? '#2563eb'
                  : inWeek
                  ? 'rgba(37,99,235,0.14)'
                  : 'transparent',
                color: isToday
                  ? '#fff'
                  : inWeek
                  ? 'var(--text-1)'
                  : 'var(--text-3)',
                border: 'none',
                borderRadius: 4, cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'rgba(37,99,235,0.22)'; }}
              onMouseLeave={e => {
                if (!isToday) e.currentTarget.style.background = inWeek ? 'rgba(37,99,235,0.14)' : 'transparent';
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── EventChip ─────────────────────────────────────────────────────────────────

interface ChipProps {
  event:   CalendarEvent;
  now:     Date;
  onClick: () => void;
}

function EventChip({ event, now, onClick }: ChipProps) {
  const { accent, bg, border, text } = eventColor(event, now);
  const dt      = new Date(event.event_dt);
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <button
      onClick={onClick}
      title={`${event.title} — ${timeStr}`}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '3px 5px', marginBottom: 2,
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 3, cursor: 'pointer',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.18)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
    >
      <div style={{ fontSize: 9, color: accent, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
        {timeStr}
      </div>
      <div style={{ fontSize: 11, color: text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
        {event.title}
      </div>
    </button>
  );
}

// ── EventDetailPopup ──────────────────────────────────────────────────────────

interface DetailProps {
  event:      CalendarEvent;
  onClose:    () => void;
  onComplete: (id: string) => void;
}

function EventDetailPopup({ event, onClose, onComplete }: DetailProps) {
  const now  = new Date();
  const { accent, bg: bgA, border: brd } = eventColor(event, now);
  const dt   = new Date(event.event_dt);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 8500, background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(2px)' }}
      />
      <div
        style={{
          position: 'fixed', zIndex: 8501,
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(460px, 92vw)',
          background: 'var(--bg-deep)',
          border: `1px solid ${brd}`,
          borderTop: `3px solid ${accent}`,
          borderRadius: 2, overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', background: bgA, borderBottom: `1px solid ${brd}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)' }}>{event.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>
              {dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {' at '}
              {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
          <span
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: accent, color: '#000', textTransform: 'uppercase', flexShrink: 0,
            }}
          >
            {event.status}
          </span>
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-0)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronLeft size={13} style={{ transform: 'rotate(135deg)' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {event.description && (
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>{event.description}</p>
          )}
          {event.creator_name && (
            <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
              Created by <b style={{ color: 'var(--text-2)' }}>{event.creator_name}</b>
            </div>
          )}
          {event.assigned_agents.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Assigned:</span>
              {event.assigned_agents.map(a => (
                <span
                  key={a.id}
                  style={{
                    fontSize: 11, padding: '2px 8px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                    borderRadius: 12, color: 'var(--text-3)',
                  }}
                >
                  {a.full_name}
                </span>
              ))}
            </div>
          )}
          {event.linked_ticket_ref && (
            <div style={{ fontSize: 12, color: 'var(--accent-indigo-fg)' }}>
              Linked: <b>#{event.linked_ticket_ref}</b>
              {event.linked_ticket_subject && (
                <span style={{ color: 'var(--text-4)' }}> — {event.linked_ticket_subject}</span>
              )}
            </div>
          )}
        </div>

        {event.status === 'pending' && (
          <div style={{ borderTop: '1px solid var(--border-panel)', padding: '10px 16px' }}>
            <button
              onClick={() => onComplete(event.id)}
              style={{
                width: '100%', padding: '8px 16px', fontSize: 13, fontWeight: 600,
                background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#15803d'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#16a34a'; }}
            >
              Mark as Completed
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── CalendarPage ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user }               = useAuthStore();
  const { data: allEvents = [] } = useEvents();

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [now, setNow]             = useState(() => new Date());
  const [detail, setDetail]       = useState<CalendarEvent | null>(null);
  const [completeId, setCompleteId] = useState('');
  const updateEvent               = useUpdateEvent(completeId);
  const gridRef                   = useRef<HTMLDivElement>(null);
  const didScroll                 = useRef(false);

  // Tick every minute for the time indicator
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to current time on first render
  useEffect(() => {
    if (didScroll.current || !gridRef.current) return;
    didScroll.current = true;
    const mins      = now.getHours() * 60 + now.getMinutes();
    const targetPx  = (mins / 30) * SLOT_HEIGHT - 220;
    gridRef.current.scrollTop = Math.max(0, targetPx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Map: "dayIdx-slotIdx" → events[]
  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of allEvents) {
      const dt     = new Date(ev.event_dt);
      const dayIdx = weekDays.findIndex(d => isSameDay(d, dt));
      if (dayIdx < 0) continue;
      const key = `${dayIdx}-${getSlotIndex(dt)}`;
      (map[key] ??= []).push(ev);
    }
    return map;
  }, [allEvents, weekDays]);

  // Current-time line position (px from grid top)
  const nowTopPx   = (now.getHours() * 60 + now.getMinutes()) / 30 * SLOT_HEIGHT;
  const nowInWeek  = weekDays.some(d => isSameDay(d, now));

  function prevWeek() { setWeekStart(d => addDays(d, -7)); }
  function nextWeek() { setWeekStart(d => addDays(d,  7)); }
  function goToday()  { setWeekStart(getWeekStart(new Date())); }

  function handleComplete(id: string) {
    setCompleteId(id);
    setTimeout(() => updateEvent.mutate({ status: 'completed' }), 0);
    setDetail(null);
  }

  const isMspStaff = user && ['msp_owner', 'msp_manager', 'msp_agent', 'owner', 'manager', 'agent'].includes(user.role);
  if (!isMspStaff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-4)', fontSize: 14 }}>
        Calendar is available to MSP staff only.
      </div>
    );
  }

  const SLOTS = Array.from({ length: 48 }, (_, i) => i);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* ── Left Sidebar ── */}
      <div
        style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 14px', gap: 18,
          overflowY: 'auto',
        }}
      >
        {/* Today button */}
        <button
          onClick={goToday}
          style={{
            padding: '7px 12px', fontSize: 12, fontWeight: 600,
            background: 'rgba(37,99,235,0.1)', color: 'var(--accent-info-fg)',
            border: '1px solid rgba(37,99,235,0.25)', borderRadius: 0, cursor: 'pointer',
            width: '100%',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.1)'; }}
        >
          Today
        </button>

        {/* Mini calendar */}
        <MiniCalendar
          weekStart={weekStart}
          onChange={d => setWeekStart(getWeekStart(d))}
        />

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {/* Legend */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            STATUS
          </div>
          {[
            { color: 'var(--accent-warn-fg)', label: 'Pending' },
            { color: 'var(--accent-danger-fg)', label: 'Overdue' },
            { color: 'var(--accent-ok-fg)', label: 'Completed' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Event count for this week */}
        {allEvents.length > 0 && (() => {
          const weekEvs = allEvents.filter(ev => weekDays.some(d => isSameDay(d, new Date(ev.event_dt))));
          if (!weekEvs.length) return null;
          return (
            <div style={{ marginTop: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                THIS WEEK
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {weekEvs.length} event{weekEvs.length !== 1 ? 's' : ''}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Main Calendar Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── Week Nav Bar ── */}
        <div
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          <CalendarIcon size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>
            {fmtWeekRange(weekStart)}
          </span>
          <button
            onClick={prevWeek}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-panel)', borderRadius: 5, cursor: 'pointer', color: 'var(--text-4)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={nextWeek}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-panel)', borderRadius: 5, cursor: 'pointer', color: 'var(--text-4)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* ── Day Column Headers ── */}
        <div
          style={{
            flexShrink: 0, display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          {/* Time column spacer */}
          <div style={{ width: TIME_COL_W, flexShrink: 0 }} />

          {/* Day headers */}
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={i}
                style={{
                  flex: 1, minWidth: 0,
                  textAlign: 'center', padding: '8px 4px',
                  borderLeft: '1px solid var(--border-subtle)',
                  background: isToday ? 'rgba(37,99,235,0.05)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-0)', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {DAY_NAMES[i]}
                </div>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto',
                    fontSize: 14, fontWeight: isToday ? 700 : 600,
                    background: isToday ? '#2563eb' : 'transparent',
                    color: isToday ? '#fff' : '#ffffff',
                  }}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Scrollable Time Grid ── */}
        <div
          ref={gridRef}
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
        >
          {/* ── Current-time line (per-column segments) ── */}
          {nowInWeek && Array.from({ length: 7 }, (_, colIdx) => (
            <div
              key={colIdx}
              style={{
                position: 'absolute',
                top: nowTopPx,
                left: `calc(${TIME_COL_W}px + ${colIdx} * ((100% - ${TIME_COL_W}px) / 7) + 1px)`,
                width: `calc((100% - ${TIME_COL_W}px) / 7 - 2px)`,
                height: 1,
                background: 'rgba(52,211,153,0.4)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* ── Slot Rows ── */}
          {SLOTS.map(slot => {
            const isHour = slot % 2 === 0;
            return (
              <div
                key={slot}
                style={{
                  display: 'flex',
                  height: SLOT_HEIGHT,
                  minHeight: SLOT_HEIGHT,
                  borderBottom: `1px solid ${isHour ? 'var(--border-subtle)' : 'var(--border-panel)'}`,
                }}
              >
                {/* Time label */}
                <div
                  style={{
                    width: TIME_COL_W, flexShrink: 0,
                    padding: '5px 8px 0 0',
                    textAlign: 'right',
                    position: 'relative',
                  }}
                >
                  {isHour && (
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {slotLabel(slot)}
                    </span>
                  )}
                </div>

                {/* Day cells */}
                {weekDays.map((_, dayIdx) => {
                  const key  = `${dayIdx}-${slot}`;
                  const evs  = eventMap[key] ?? [];
                  const isCurrentDay = nowInWeek && isSameDay(weekDays[dayIdx], now);
                  return (
                    <div
                      key={dayIdx}
                      style={{
                        flex: 1, minWidth: 0,
                        borderLeft: '1px solid var(--border-subtle)',
                        background: isCurrentDay ? 'rgba(37,99,235,0.025)' : 'transparent',
                        padding: evs.length ? '2px 3px' : 0,
                        overflow: 'hidden',
                      }}
                    >
                      {evs.map(ev => (
                        <EventChip
                          key={ev.id}
                          event={ev}
                          now={now}
                          onClick={() => setDetail(ev)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Event Detail Popup ── */}
      {detail && (
        <EventDetailPopup
          event={detail}
          onClose={() => setDetail(null)}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}
