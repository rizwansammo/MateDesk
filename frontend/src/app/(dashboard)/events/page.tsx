'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, Plus, X, Check, Loader2, Pencil, Trash2,
  AlertCircle, Users, Link as LinkIcon, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent } from '@/hooks/useEvents';
import { useAgents } from '@/hooks/useAgents';
import { useAuthStore } from '@/store/useAuthStore';
import type { CalendarEvent } from '@/types/events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventColor(ev: CalendarEvent): { accent: string; bg: string; border: string } {
  if (ev.status === 'completed') return { accent: '#34d399', bg: 'rgba(16,185,129,0.07)', border: 'rgba(52,211,153,0.3)' };
  const isOverdue = new Date(ev.event_dt) < new Date();
  if (isOverdue) return { accent: '#f87171', bg: 'rgba(239,68,68,0.07)', border: 'rgba(248,113,113,0.3)' };
  return { accent: '#fbbf24', bg: 'rgba(245,158,11,0.07)', border: 'rgba(251,191,36,0.3)' };
}

function fmtDt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function fmtTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 };
const inp: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' };

// ── Mini Date Picker ──────────────────────────────────────────────────────────

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today    = new Date();
  const selected = value ? new Date(value + 'T00:00:00') : null;
  const [view, setView] = useState(() => {
    const d = selected ?? today;
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  function navigate(dir: -1 | 1) {
    setView(v => {
      let m = v.month + dir;
      let y = v.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  }

  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: 10, userSelect: 'none', minWidth: 220 }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', display: 'flex' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
          <ChevronLeft size={13} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{MONTHS[view.month]} {view.year}</span>
        <button onClick={() => navigate(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', display: 'flex' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = selected && fmtDateInput(selected.toISOString()) === dateStr;
          const isToday = today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day;
          return (
            <button
              key={day}
              onClick={() => onChange(dateStr)}
              style={{
                textAlign: 'center', fontSize: 12, padding: '4px 0', border: 'none', cursor: 'pointer',
                background: isSelected ? '#2563eb' : 'transparent',
                color: isSelected ? '#fff' : isToday ? '#60a5fa' : 'var(--text-2)',
                fontWeight: isSelected || isToday ? 700 : 400,
                outline: isToday && !isSelected ? '1px solid rgba(96,165,250,0.4)' : 'none',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Mini Clock Picker ─────────────────────────────────────────────────────────

function MiniClock({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [h, m] = value ? value.split(':').map(Number) : [9, 0];

  function adjust(field: 'h' | 'm', dir: 1 | -1) {
    let newH = h, newM = m;
    if (field === 'h') newH = (h + dir + 24) % 24;
    if (field === 'm') newM = (m + dir * 5 + 60) % 60;
    onChange(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const mins  = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: 12, minWidth: 180 }}>
      {/* Display */}
      <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, color: 'var(--text-1)', fontFamily: '"IBM Plex Mono", monospace', marginBottom: 10, letterSpacing: '0.04em' }}>
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
      </div>

      {/* Hour + Minute selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* Hours */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, textAlign: 'center' }}>Hour</div>
          <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border-subtle)' }}>
            {hours.map(hr => (
              <button
                key={hr}
                onClick={() => onChange(`${String(hr).padStart(2, '0')}:${String(m).padStart(2, '0')}`)}
                style={{ display: 'block', width: '100%', padding: '3px 0', textAlign: 'center', fontSize: 12, background: hr === h ? '#2563eb' : 'transparent', color: hr === h ? '#fff' : 'var(--text-2)', border: 'none', cursor: 'pointer', fontWeight: hr === h ? 700 : 400 }}
                onMouseEnter={e => { if (hr !== h) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (hr !== h) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {String(hr).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
        {/* Minutes */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, textAlign: 'center' }}>Min</div>
          <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border-subtle)' }}>
            {mins.map(mn => (
              <button
                key={mn}
                onClick={() => onChange(`${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`)}
                style={{ display: 'block', width: '100%', padding: '3px 0', textAlign: 'center', fontSize: 12, background: mn === m ? '#2563eb' : 'transparent', color: mn === m ? '#fff' : 'var(--text-2)', border: 'none', cursor: 'pointer', fontWeight: mn === m ? 700 : 400 }}
                onMouseEnter={e => { if (mn !== m) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (mn !== m) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {String(mn).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({
  ev, onOpen, onComplete, onDelete,
}: {
  ev: CalendarEvent;
  onOpen:    (ev: CalendarEvent) => void;
  onComplete: (ev: CalendarEvent) => void;
  onDelete:  (ev: CalendarEvent) => void;
}) {
  const col = eventColor(ev);
  const isOverdue = ev.status === 'pending' && new Date(ev.event_dt) < new Date();

  return (
    <div
      onClick={() => onOpen(ev)}
      style={{ background: col.bg, border: `1px solid ${col.border}`, borderLeft: `3px solid ${col.accent}`, padding: '14px 16px', cursor: 'pointer', position: 'relative', transition: 'box-shadow 0.12s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${col.accent}44`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Status dot */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: col.accent, background: `${col.accent}18`, border: `1px solid ${col.border}`, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {ev.status === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Pending'}
        </span>
        {ev.status === 'pending' && (
          <button
            onClick={e => { e.stopPropagation(); onComplete(ev); }}
            title="Mark as completed"
            style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.25)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.1)'; }}
          >
            <Check size={11} style={{ color: '#34d399' }} />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete(ev); }}
          title="Delete event"
          style={{ width: 22, height: 22, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.22)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)'; }}
        >
          <Trash2 size={10} style={{ color: '#f87171' }} />
        </button>
      </div>

      <div style={{ paddingRight: 96 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)', marginBottom: 5, lineHeight: 1.4 }}>{ev.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Clock size={11} style={{ color: col.accent, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: col.accent }}>{fmtDt(ev.event_dt)}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
          Created by {ev.creator_name ?? 'Unknown'}
          {ev.assigned_agents.length > 0 && ` · ${ev.assigned_agents.map(a => a.full_name).join(', ')}`}
        </div>
      </div>
    </div>
  );
}

// ── Event Detail Popup ────────────────────────────────────────────────────────

function EventDetailPopup({
  ev, onClose, onEdit, onDelete, onComplete,
}: {
  ev: CalendarEvent;
  onClose:   () => void;
  onEdit:    () => void;
  onDelete:  () => void;
  onComplete: () => void;
}) {
  const col = eventColor(ev);
  const isOverdue = ev.status === 'pending' && new Date(ev.event_dt) < new Date();
  const router = useRouter();

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', border: `1px solid ${col.border}`, borderTop: `3px solid ${col.accent}`, width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 18px 12px 18px', borderBottom: '1px solid var(--border-md)' }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-0)', marginBottom: 6, lineHeight: 1.4 }}>{ev.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={12} style={{ color: col.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: col.accent }}>{fmtDt(ev.event_dt)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: col.accent, background: `${col.accent}18`, border: `1px solid ${col.border}`, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {ev.status === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Pending'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#60a5fa', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)'; }}>
              <Pencil size={10} /> Edit
            </button>
            <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.18)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}>
              <Trash2 size={10} /> Delete
            </button>
            <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ev.description && (
            <div>
              <div style={{ ...lbl, marginBottom: 6 }}>Description</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>{ev.description}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ ...lbl, marginBottom: 4 }}>Created by</div>
              <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{ev.creator_name ?? '—'}</span>
            </div>
            {ev.linked_ticket_ref && (
              <div>
                <div style={{ ...lbl, marginBottom: 4 }}>Linked Ticket</div>
                <button
                  onClick={() => router.push(`/requests/${ev.linked_ticket_ref}`)}
                  style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <LinkIcon size={11} /> {ev.linked_ticket_ref}
                </button>
              </div>
            )}
          </div>

          {ev.assigned_agents.length > 0 && (
            <div>
              <div style={{ ...lbl, marginBottom: 6 }}>Assigned Agents</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ev.assigned_agents.map(a => (
                  <span key={a.id} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', padding: '3px 9px' }}>
                    {a.full_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {ev.status === 'pending' && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={onComplete}
              style={{ width: '100%', height: 36, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.22)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(52,211,153,0.12)'; }}
            >
              <Check size={13} /> Mark as Completed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────

type FormState = {
  title:        string;
  description:  string;
  date:         string;
  time:         string;
  agentIds:     string[];
  ticketRef:    string;
};

function EventFormModal({
  initial,
  title: modalTitle,
  onClose,
  onSave,
  saving,
  error,
  agents,
}: {
  initial:    FormState;
  title:      string;
  onClose:    () => void;
  onSave:     (f: FormState) => void;
  saving:     boolean;
  error:      string;
  agents:     { id: string; full_name: string; role: string }[];
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [showCal,  setShowCal]  = useState(false);
  const [showClock, setShowClock] = useState(false);
  const calRef   = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node))   setShowCal(false);
      if (clockRef.current && !clockRef.current.contains(e.target as Node)) setShowClock(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggleAgent(id: string) {
    setForm(f => ({
      ...f,
      agentIds: f.agentIds.includes(id) ? f.agentIds.filter(x => x !== id) : [...f.agentIds, id],
    }));
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={14} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{modalTitle}</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <div>
            <label style={lbl}>Title *</label>
            <input
              type="text" autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Event title"
              style={inp}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={lbl}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional details about this event…"
              style={{ ...inp, height: 'auto', minHeight: 80, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>

          {/* Date + Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* Date */}
            <div ref={calRef} style={{ position: 'relative' }}>
              <label style={lbl}>Date *</label>
              <button
                type="button"
                onClick={() => { setShowCal(v => !v); setShowClock(false); }}
                style={{ ...inp, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <CalendarDays size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: form.date ? 'var(--text-1)' : 'var(--text-5)' }}>
                  {form.date || 'Pick date…'}
                </span>
              </button>
              {showCal && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 400, marginTop: 4 }}>
                  <MiniCalendar
                    value={form.date}
                    onChange={d => { setForm(f => ({ ...f, date: d })); setShowCal(false); }}
                  />
                </div>
              )}
            </div>

            {/* Time */}
            <div ref={clockRef} style={{ position: 'relative' }}>
              <label style={lbl}>Time *</label>
              <button
                type="button"
                onClick={() => { setShowClock(v => !v); setShowCal(false); }}
                style={{ ...inp, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Clock size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: form.time ? 'var(--text-1)' : 'var(--text-5)' }}>
                  {form.time || 'Pick time…'}
                </span>
              </button>
              {showClock && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 400, marginTop: 4 }}>
                  <MiniClock
                    value={form.time}
                    onChange={t => { setForm(f => ({ ...f, time: t })); }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Assign Agents */}
          <div>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Users size={11} /> Assign Agents
            </label>
            <div style={{ border: '1px solid var(--border-md)', background: 'var(--bg-base)', maxHeight: 140, overflowY: 'auto' }}>
              {agents.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-5)' }}>No agents available</div>
              ) : agents.map(a => {
                const selected = form.agentIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: selected ? 'rgba(37,99,235,0.08)' : 'transparent', borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAgent(a.id)}
                      style={{ width: 14, height: 14, accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, color: selected ? 'var(--text-0)' : 'var(--text-2)', fontWeight: selected ? 600 : 400 }}>{a.full_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-5)', marginLeft: 'auto' }}>{a.role}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Linked Ticket */}
          <div>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>
              <LinkIcon size={11} /> Link Ticket (optional)
            </label>
            <input
              type="text"
              value={form.ticketRef}
              onChange={e => setForm(f => ({ ...f, ticketRef: e.target.value }))}
              placeholder="e.g. T17052026-0001"
              style={inp}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>

          {error && (
            <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <button
            disabled={saving}
            onClick={() => onSave(form)}
            style={{ padding: '7px 22px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Save Event
          </button>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const DEFAULT_TIME = '09:00';

type ModalMode = { type: 'create' } | { type: 'edit'; ev: CalendarEvent };

export default function EventsPage() {
  const { user } = useAuthStore();
  const isMSP    = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const { data: events = [], isLoading } = useEvents();
  const { data: agents  = [] }           = useAgents();

  const createEvent = useCreateEvent();
  const [modal,     setModal]     = useState<ModalMode | null>(null);
  const [formError, setFormError] = useState('');

  const [detailEv,  setDetailEv]  = useState<CalendarEvent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CalendarEvent | null>(null);

  const updateEventById = (id: string) => useUpdateEvent(id); // eslint-disable-line
  // Per-event update hooks can't be called in loops — use a single generic approach:
  const [activeUpdateId, setActiveUpdateId] = useState('');
  const updateEvent = useUpdateEvent(activeUpdateId);
  const deleteEvent = useDeleteEvent(activeUpdateId);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const filtered = events.filter(ev => {
    if (statusFilter === 'pending')   return ev.status === 'pending';
    if (statusFilter === 'completed') return ev.status === 'completed';
    return true;
  });

  function getFormInitial(ev?: CalendarEvent): FormState {
    if (ev) return {
      title:       ev.title,
      description: ev.description,
      date:        fmtDateInput(ev.event_dt),
      time:        fmtTimeInput(ev.event_dt),
      agentIds:    ev.assigned_agents.map(a => a.id),
      ticketRef:   ev.linked_ticket_ref ?? '',
    };
    return { title: '', description: '', date: TODAY_ISO, time: DEFAULT_TIME, agentIds: [], ticketRef: '' };
  }

  function handleSave(form: FormState) {
    if (!form.title.trim())  { setFormError('Title is required.'); return; }
    if (!form.date)          { setFormError('Date is required.'); return; }
    if (!form.time)          { setFormError('Time is required.'); return; }
    setFormError('');

    const event_dt = combineDateTime(form.date, form.time);

    if (modal?.type === 'create') {
      createEvent.mutate(
        { title: form.title.trim(), description: form.description, event_dt, assigned_agent_ids: form.agentIds, linked_ticket_ref: form.ticketRef || undefined },
        { onSuccess: () => setModal(null), onError: (e: unknown) => setFormError((e instanceof Error ? e.message : null) ?? 'Failed to save.') }
      );
    } else if (modal?.type === 'edit') {
      setActiveUpdateId(modal.ev.id);
      setTimeout(() => {
        updateEvent.mutate(
          { title: form.title.trim(), description: form.description, event_dt, assigned_agent_ids: form.agentIds, linked_ticket_ref: form.ticketRef || null },
          { onSuccess: () => { setModal(null); setDetailEv(null); }, onError: (e: unknown) => setFormError((e instanceof Error ? e.message : null) ?? 'Failed to save.') }
        );
      }, 0);
    }
  }

  function openEdit(ev: CalendarEvent) {
    setActiveUpdateId(ev.id);
    setFormError('');
    setDetailEv(null);
    setModal({ type: 'edit', ev });
  }

  function handleComplete(ev: CalendarEvent) {
    setActiveUpdateId(ev.id);
    setTimeout(() => {
      updateEvent.mutate({ status: 'completed' }, { onSuccess: () => setDetailEv(null) });
    }, 0);
  }

  function confirmDelete(ev: CalendarEvent) {
    setActiveUpdateId(ev.id);
    setDeleteConfirm(ev);
    setDetailEv(null);
  }

  function doDelete() {
    if (!deleteConfirm) return;
    deleteEvent.mutate(undefined, { onSuccess: () => setDeleteConfirm(null) });
  }

  const pendingCount   = events.filter(e => e.status === 'pending' && new Date(e.event_dt) >= new Date()).length;
  const overdueCount   = events.filter(e => e.status === 'pending' && new Date(e.event_dt) < new Date()).length;
  const completedCount = events.filter(e => e.status === 'completed').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <CalendarDays size={13} style={{ color: '#60a5fa' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Events</span>
        <div style={{ flex: 1 }} />
        {isMSP && (
          <button
            onClick={() => { setFormError(''); setModal({ type: 'create' }); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 12px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d4ed8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2563eb'; }}
          >
            <Plus size={12} /> New Event
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Pending',   value: pendingCount,   color: '#fbbf24', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(251,191,36,0.25)' },
            { label: 'Overdue',   value: overdueCount,   color: '#f87171', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(248,113,113,0.25)' },
            { label: 'Completed', value: completedCount, color: '#34d399', bg: 'rgba(16,185,129,0.08)',   border: 'rgba(52,211,153,0.25)' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: '14px 18px', background: s.bg, border: `1px solid ${s.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          {(['all', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{ padding: '7px 18px', fontSize: 12, fontWeight: statusFilter === f ? 700 : 500, color: statusFilter === f ? '#60a5fa' : 'var(--text-4)', background: 'none', border: 'none', borderBottom: statusFilter === f ? '2px solid #60a5fa' : '2px solid transparent', cursor: 'pointer', textTransform: 'capitalize', marginBottom: -1 }}
            >
              {f === 'all' ? `All (${events.length})` : f === 'pending' ? `Pending (${pendingCount + overdueCount})` : `Completed (${completedCount})`}
            </button>
          ))}
        </div>

        {/* Event list */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
            <CalendarDays size={40} style={{ color: 'var(--text-5)' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)' }}>No events yet</p>
            {isMSP && (
              <button
                onClick={() => { setFormError(''); setModal({ type: 'create' }); }}
                style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <Plus size={12} /> Create first event
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(ev => (
              <EventCard
                key={ev.id}
                ev={ev}
                onOpen={setDetailEv}
                onComplete={handleComplete}
                onDelete={confirmDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <EventFormModal
          title={modal.type === 'create' ? 'New Event' : 'Edit Event'}
          initial={getFormInitial(modal.type === 'edit' ? modal.ev : undefined)}
          agents={agents}
          saving={createEvent.isPending || updateEvent.isPending}
          error={formError}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Detail popup */}
      {detailEv && (
        <EventDetailPopup
          ev={detailEv}
          onClose={() => setDetailEv(null)}
          onEdit={() => openEdit(detailEv)}
          onComplete={() => handleComplete(detailEv)}
          onDelete={() => confirmDelete(detailEv)}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 380 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-md)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Delete Event</span>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text-1)' }}>{deleteConfirm.title}</strong>? This cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                disabled={deleteEvent.isPending}
                onClick={doDelete}
                style={{ padding: '7px 18px', background: '#b91c1c', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: deleteEvent.isPending ? 0.6 : 1 }}
              >
                {deleteEvent.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Delete
              </button>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
