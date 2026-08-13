'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Clock, Calendar, CheckCircle, AlertTriangle } from 'lucide-react';
import { useMyUpcomingEvents, useUpdateEvent } from '@/hooks/useEvents';
import { useAuthStore } from '@/store/useAuthStore';
import type { CalendarEvent } from '@/types/events';
import { useRouter } from 'next/navigation';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtCountdown(diffMs: number): string {
  const abs  = Math.abs(diffMs);
  const secs = Math.floor(abs / 1000) % 60;
  const mins = Math.floor(abs / 60_000) % 60;
  const hrs  = Math.floor(abs / 3_600_000);
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function fmtDt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const THIRTY_MIN_MS = 30 * 60 * 1000;

// ─── EventWarningPopup ────────────────────────────────────────────────────────

interface PopupProps {
  event:    CalendarEvent;
  now:      Date;
  onDismiss: () => void;
  onComplete: () => void;
}

function EventWarningPopup({ event, now, onDismiss, onComplete }: PopupProps) {
  const router      = useRouter();
  const eventTime   = new Date(event.event_dt);
  const diffMs      = eventTime.getTime() - now.getTime();
  const isOverdue   = diffMs < 0;
  const accent      = isOverdue ? '#f87171' : '#fbbf24';
  const bgAccent    = isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.10)';
  const borderColor = isOverdue ? 'rgba(248,113,113,0.4)' : 'rgba(251,191,36,0.4)';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed', zIndex: 9001,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(560px, 92vw)',
          background: 'var(--bg-deep)',
          border: `1px solid ${borderColor}`,
          borderTop: `3px solid ${accent}`,
          borderRadius: 10,
          boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px ${borderColor}`,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 18px',
            background: bgAccent,
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <AlertTriangle size={16} style={{ color: accent, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: accent, flex: 1 }}>
            {isOverdue ? 'Event Overdue' : 'Upcoming Event — 30 min warning'}
          </span>
          <button
            onClick={onDismiss}
            style={{
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-4)', borderRadius: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border-panel)'; e.currentTarget.style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-4)'; }}
            title="Dismiss (remind again in 30 min if still pending)"
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Event title */}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-0)', marginBottom: 4 }}>
              {event.title}
            </div>
            {event.description && (
              <div style={{ fontSize: 13, color: 'var(--text-4)', lineHeight: 1.5 }}>
                {event.description}
              </div>
            )}
          </div>

          {/* Time info */}
          <div
            style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--bg-card)',
              border: `1px solid var(--border-subtle)`,
              borderRadius: 6,
            }}
          >
            <Calendar size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{fmtDt(event.event_dt)}</span>
          </div>

          {/* Countdown timer */}
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '16px 14px',
              background: bgAccent,
              border: `1px solid ${borderColor}`,
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {isOverdue ? 'Overdue by' : 'Starts in'}
            </span>
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 32, fontWeight: 700, color: accent,
                letterSpacing: '-0.02em',
              }}
            >
              {fmtCountdown(diffMs)}
            </span>
          </div>

          {/* Assigned agents */}
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

          {/* Linked ticket */}
          {event.linked_ticket_ref && (
            <button
              onClick={() => { router.push(`/requests/${event.linked_ticket_ref}`); onDismiss(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', width: '100%', textAlign: 'left',
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 6, cursor: 'pointer',
                color: 'var(--accent-indigo-fg)', fontSize: 12,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; }}
            >
              View linked ticket #{event.linked_ticket_ref}
              {event.linked_ticket_subject && (
                <span style={{ color: 'var(--text-4)', marginLeft: 4 }}>— {event.linked_ticket_subject}</span>
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', gap: 8, padding: '12px 18px',
            borderTop: '1px solid var(--border-panel)',
            background: 'var(--bg-card)',
          }}
        >
          <button
            onClick={onComplete}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 16px', fontSize: 13, fontWeight: 600,
              background: '#16a34a', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#15803d'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#16a34a'; }}
          >
            <CheckCircle size={14} />
            Mark as Completed
          </button>
          <button
            onClick={onDismiss}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 500,
              background: 'transparent', color: 'var(--text-4)',
              border: '1px solid var(--border-panel)', borderRadius: 6, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--border-panel)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
          >
            Remind later
          </button>
        </div>
      </div>
    </>
  );
}

// ─── NotificationBar ──────────────────────────────────────────────────────────

interface BarProps {
  events: CalendarEvent[];
  now:    Date;
  onClickEvent: (ev: CalendarEvent) => void;
  onDismissEvent: (id: string) => void;
}

function NotificationBar({ events, now, onClickEvent, onDismissEvent }: BarProps) {
  if (events.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 8000,
        display: 'flex', flexDirection: 'column', gap: 0,
        pointerEvents: 'none',
      }}
    >
      {events.slice(0, 3).map(ev => {
        const diffMs    = new Date(ev.event_dt).getTime() - now.getTime();
        const isOverdue = diffMs < 0;
        const accent    = isOverdue ? '#f87171' : '#fbbf24';
        const bg        = isOverdue ? 'rgba(17,5,5,0.97)' : 'rgba(17,14,5,0.97)';
        const border    = isOverdue ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)';

        return (
          <div
            key={ev.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px',
              background: bg,
              borderTop: `1px solid ${border}`,
              borderLeft: `3px solid ${accent}`,
              pointerEvents: 'all',
            }}
          >
            <Bell size={13} style={{ color: accent, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: accent, fontWeight: 600, flexShrink: 0 }}>
              {isOverdue ? 'OVERDUE' : 'IN 30 MIN'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.title}
            </span>
            <span style={{ fontSize: 11, color: accent, flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
              {fmtCountdown(diffMs)}
            </span>
            <button
              onClick={() => onClickEvent(ev)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px',
                background: 'transparent', border: `1px solid ${border}`,
                color: accent, cursor: 'pointer', borderRadius: 4, flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              View
            </button>
            <button
              onClick={() => onDismissEvent(ev.id)}
              style={{
                width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-3)', borderRadius: 3, flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── EventWarningSystem ───────────────────────────────────────────────────────

export function EventWarningSystem() {
  const user                = useAuthStore(s => s.user);
  const { data: events }    = useMyUpcomingEvents();
  const [now, setNow]       = useState(() => new Date());
  // dismissedAt[eventId] = timestamp of last dismissal
  const [dismissedAt, setDismissedAt] = useState<Record<string, number>>({});
  // popup = the event currently shown in the semi-fullscreen popup
  const [popup, setPopup]   = useState<CalendarEvent | null>(null);
  // track which event id we want to update (for the hook)
  const [updateId, setUpdateId] = useState<string>('');
  const updateEvent             = useUpdateEvent(updateId);

  // Tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Evaluate which events qualify for warning
  const warningEvents = useCallback((): CalendarEvent[] => {
    if (!user || !events) return [];
    const nowMs = now.getTime();
    return events.filter(ev => {
      // Must be assigned to current user
      const assigned = ev.assigned_agents.some(a => a.id === user.id);
      if (!assigned) return false;
      if (ev.status === 'completed') return false;

      const evMs   = new Date(ev.event_dt).getTime();
      const diffMs = evMs - nowMs;

      // Within 30 min window: event is ≤ 30min away (future) OR overdue
      const inWindow = diffMs <= THIRTY_MIN_MS;
      if (!inWindow) return false;

      // Check if dismissed within last 30 min
      const lastDismiss = dismissedAt[ev.id];
      if (lastDismiss && nowMs - lastDismiss < THIRTY_MIN_MS) return false;

      return true;
    });
  }, [user, events, now, dismissedAt]);

  // When warning events change and no popup is open, open the most urgent one
  useEffect(() => {
    const qualified = warningEvents();
    if (qualified.length === 0) {
      setPopup(null);
      return;
    }
    // Show popup if none is open, or if the current popup event was completed/dismissed
    setPopup(prev => {
      if (prev && qualified.some(e => e.id === prev.id)) return prev; // keep current
      // Sort: overdue first, then nearest
      const sorted = [...qualified].sort((a, b) => {
        const da = new Date(a.event_dt).getTime() - now.getTime();
        const db = new Date(b.event_dt).getTime() - now.getTime();
        return da - db; // most negative (most overdue) first
      });
      return sorted[0];
    });
  }, [warningEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss(id: string) {
    setDismissedAt(prev => ({ ...prev, [id]: Date.now() }));
    setPopup(prev => prev?.id === id ? null : prev);
  }

  function handleComplete(id: string) {
    setUpdateId(id);
    // We need to wait for updateId to be set — use a tiny timeout to let state settle
    setTimeout(() => {
      updateEvent.mutate({ status: 'completed' });
    }, 0);
    setDismissedAt(prev => ({ ...prev, [id]: Date.now() }));
    setPopup(prev => prev?.id === id ? null : prev);
  }

  // Don't render for non-MSP users or if not authenticated
  if (!user) return null;
  // Only MSP staff (agents, managers, owners) get warnings — not regular customers
  const isMspStaff = ['agent', 'manager', 'owner'].includes(user.role);
  if (!isMspStaff) return null;

  const qualified = warningEvents();

  return (
    <>
      {popup && (
        <EventWarningPopup
          event={popup}
          now={now}
          onDismiss={() => handleDismiss(popup.id)}
          onComplete={() => handleComplete(popup.id)}
        />
      )}
      <NotificationBar
        events={qualified.filter(e => !popup || e.id !== popup.id)}
        now={now}
        onClickEvent={ev => setPopup(ev)}
        onDismissEvent={id => handleDismiss(id)}
      />
    </>
  );
}
