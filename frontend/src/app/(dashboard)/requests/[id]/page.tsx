'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, MessageSquare, Lock, Send, User,
  Calendar, Building2, Tag, AlertCircle, FileText,
  Loader2, Pencil, X, Check, Copy, Clipboard, Image, Clock,
  GitMerge, Trash2, Plus, Search, Archive, Shield, ShieldAlert, Mail,
} from 'lucide-react';
import { CannedPicker } from '@/components/CannedPicker';
import { getTzAbbr } from '@/lib/timezones';
import type { TicketAttachment, TicketDetail, TicketReply } from '@/types/tickets';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { getAvatarColor, getInitials } from '@/lib/utils';
import { useTicket, useAddReply, useUpdateTicket, useAddSecondaryAgent, useRemoveSecondaryAgent, useAddTimeLog, useDeleteTimeLog, useMergeTicket, useAbsorbTicket, useCustomerHistory } from '@/hooks/useTickets';
import { useTickets } from '@/hooks/useTickets';
import { useAgents } from '@/hooks/useAgents';
import { useGroups } from '@/hooks/useGroups';
import { useOrgUsers } from '@/hooks/useOrganizations';
import { useAuthStore } from '@/store/useAuthStore';
import { useCreateKBArticle, useKBArticles, useLinkTicketToArticle, useUnlinkTicketFromArticle, useKBArticle } from '@/hooks/useKB';
import { useAutomationLogs, TRIGGER_LABELS, TRIGGER_COLORS } from '@/hooks/useAutomation';
import { TicketProjectAssociationCard } from '@/components/projects/TicketProjectAssociationCard';

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  open:                { label: 'Open',               color: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)'  },
  pending:             { label: 'Pending',             color: 'var(--accent-indigo-fg)', bg: 'var(--accent-indigo-bg)'  },
  in_progress:         { label: 'In Progress',         color: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)'  },
  waiting_on_customer: { label: 'Waiting on Customer', color: 'var(--accent-orange-fg)', bg: 'var(--accent-orange-bg)'  },
  solved:              { label: 'Resolved',            color: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)'  },
  closed:              { label: 'Closed',              color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)'  },
  normal:   { label: 'Medium',   color: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)' },
  high:     { label: 'High',     color: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)' },
  critical: { label: 'Critical', color: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)'  },
};

const LEVEL_COLORS: Record<string, string> = {
  L1: '#60a5fa', L2: '#a78bfa', L3: '#f87171',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const totalMinutes = Math.floor(diff / 60000);
  if (totalMinutes < 1)  return 'just now';
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24)   return `${totalHours} hour${totalHours === 1 ? '' : 's'} ago`;
  const days  = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  return `${days} day${days === 1 ? '' : 's'} ${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function formatDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...(tz ? { timeZone: tz } : {}),
  };
  return new Date(iso).toLocaleString('en-US', opts);
}

function formatDateWithAgo(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  return `${formatDate(iso, tz)} (${timeAgo(iso)})`;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h   = Math.floor(m / 60);
  const min = m % 60;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

function slaRelTime(iso: string): { label: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  const abs  = Math.abs(diff);
  const m    = Math.floor(abs / 60000);
  let label: string;
  if (m < 60)         label = `${m}m`;
  else if (m < 1440)  label = `${Math.floor(m / 60)}h ${m % 60}m`;
  else                label = `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  return { label: diff < 0 ? `${label} overdue` : `in ${label}`, overdue: diff < 0 };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SystemEvent({ body }: { body: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      <span style={{ fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{body}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
    </div>
  );
}

// ── Absorbed ticket card ──────────────────────────────────────────────────────
// Shown inline in the primary ticket's conversation when another ticket was
// merged/absorbed into it. Collapsed by default; expands to show the secondary
// ticket's description + full message thread (fetched on first expand).

function AbsorbedTicketCard({
  sourceRef, subject, mergedBy, mergedAt,
}: {
  sourceRef: string;
  subject:   string;
  mergedBy:  string;
  mergedAt:  string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [fetched,  setFetched]  = useState<{ description: string; description_html?: string; replies: TicketReply[] } | null>(null);
  const [fetchErr, setFetchErr] = useState(false);

  async function toggle() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (fetched || fetchErr) return;
    setLoading(true);
    try {
      const data = await apiFetch<TicketDetail>(`/api/tickets/${sourceRef}/`);
      setFetched({
        description: data.description,
        description_html: data.description_html,
        replies: (data.replies ?? []).filter(r => r.type !== 'system_event'),
      });
    } catch {
      setFetchErr(true);
    } finally {
      setLoading(false);
    }
  }

  const msgCount = fetched?.replies.length;

  return (
    <div style={{
      border: '1px solid rgba(99,102,241,0.3)',
      background: 'rgba(99,102,241,0.04)',
      borderLeft: '3px solid #6366f1',
    }}>
      {/* Header — always visible */}
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
      >
        <GitMerge size={14} style={{ color: 'var(--accent-indigo-fg)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Merged:{' '}
            <span style={{ color: 'var(--accent-indigo-fg)', fontFamily: '"IBM Plex Mono", monospace' }}>{sourceRef}</span>
            {subject && (
              <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> — {subject}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
            by {mergedBy} · {timeAgo(mergedAt)}
            {msgCount !== undefined && (
              <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                · {msgCount} message{msgCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--accent-indigo-fg)', flexShrink: 0, userSelect: 'none' }}>
          {expanded ? 'Collapse ▴' : 'Show conversation ▾'}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(99,102,241,0.2)', padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-indigo-fg)' }} />
            </div>
          ) : fetchErr ? (
            <div style={{ fontSize: 12, color: 'var(--accent-danger-fg)', padding: '4px 0' }}>Failed to load ticket data.</div>
          ) : fetched ? (
            <>
              {(fetched.description || fetched.description_html) && (
                <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-panel)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-indigo-fg)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Description
                  </div>
                  <EmailContent html={fetched.description_html} text={fetched.description} />
                </div>
              )}
              {fetched.replies.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fetched.replies.slice().reverse().map(r => (
                    <MessageBubble
                      key={r.id}
                      type={r.type}
                      sender={r.author_name}
                      senderEmail={r.author_email ?? null}
                      authorId={r.author_id ?? null}
                      body={r.body}
                      bodyHtml={r.body_html}
                      timestamp={r.created_at}
                      isAgent={r.author_is_agent}
                      attachments={r.attachments ?? []}
                      toEmails={r.to_emails ?? []}
                      ccEmails={r.cc_emails ?? []}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No messages in this ticket.</div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

const MEDIA_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
function resolveMediaUrl(url: string): string {
  return url.startsWith('http') ? url : `${MEDIA_BASE}${url}`;
}

function InlineImages({ attachments }: { attachments: TicketAttachment[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!attachments.length) return;
    let alive = true;
    const owned: string[] = [];

    (async () => {
      const result: Record<string, string> = {};
      await Promise.all(
        attachments.map(async (a) => {
          try {
            const { blob } = await apiFetchBlob(a.url);
            const url = URL.createObjectURL(blob);
            owned.push(url);
            result[a.id] = url;
          } catch {
            // attachment failed to load — omit from display
          }
        })
      );
      if (alive) setBlobUrls(result);
      else owned.forEach(URL.revokeObjectURL);
    })();

    return () => {
      alive = false;
    };
  }, [attachments]);

  useEffect(() => {
    const urls = Object.values(blobUrls);
    return () => { urls.forEach(URL.revokeObjectURL); };
  }, [blobUrls]);

  if (!attachments.length) return null;
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {attachments.map(a => {
          const src = blobUrls[a.id];
          if (!src) return null;
          return (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={() => setLightbox(src)}
                style={{ padding: 0, border: '1px solid var(--border-md)', background: 'var(--bg-base)', cursor: 'zoom-in', borderRadius: 3, overflow: 'hidden', display: 'block' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src} alt={a.filename}
                  style={{ display: 'block', maxWidth: 280, maxHeight: 200, objectFit: 'cover' }}
                />
              </button>
              <span style={{ fontSize: 10, color: 'var(--text-3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.filename}
              </span>
            </div>
          );
        })}
      </div>
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }} />
        </div>
      )}
    </>
  );
}

function EmailContent({ html, text, mono = false }: { html?: string; text: string; mono?: boolean }) {
  const presentationStyle: React.CSSProperties = {
    ...(mono ? MONO : {}),
    fontSize: mono ? 15 : 13,
    lineHeight: 1.65,
    color: 'var(--text-2)',
  };

  if (html) {
    return (
      <div
        className="ticket-email-html"
        style={{
          ...presentationStyle,
          background: 'transparent',
          overflowX: 'auto',
          wordBreak: 'normal',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div style={{
      ...presentationStyle,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {text}
    </div>
  );
}

function MessageBubble({
  type, sender, senderEmail, authorId, body, bodyHtml, timestamp, isAgent, attachments, toEmails, ccEmails,
}: {
  type: string; sender: string; senderEmail: string | null; authorId: string | null;
  body: string; bodyHtml?: string; timestamp: string; isAgent: boolean; attachments: TicketAttachment[];
  toEmails?: string[]; ccEmails?: string[];
}) {
  const router     = useRouter();
  const isInternal = type === 'internal_note';
  const avatarBg   = isAgent ? getAvatarColor(sender) : '#1e4a7a';
  const displayName = senderEmail ? `${sender} [${senderEmail}]` : sender;
  const fullDate    = formatDateWithAgo(timestamp);

  return (
    <div style={{
      background: isInternal ? 'rgba(245,158,11,0.03)' : 'var(--bg-card)',
      border: `1px solid ${isInternal ? 'rgba(245,158,11,0.25)' : 'var(--border-md)'}`,
      borderLeft: isInternal ? '3px solid rgba(245,158,11,0.45)' : '1px solid var(--border-md)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px 12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: avatarBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {getInitials(sender)}
        </div>

        {/* Name + timestamp col */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {authorId ? (
                <button
                  onClick={() => router.push(`/users/${authorId}`)}
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', wordBreak: 'break-all' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                >
                  {displayName}
                </button>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', wordBreak: 'break-all' }}>{displayName}</span>
              )}
            </div>
            {isInternal ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: 'var(--accent-warn-fg)', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', padding: '2px 7px', flexShrink: 0 }}>
                <Lock size={9} /> Internal Note
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-info-fg)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 7px', flexShrink: 0 }}>
                Public Reply
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-1)' }}>{fullDate}</div>
          {(toEmails?.length || ccEmails?.length) ? (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {toEmails && toEmails.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-3)' }}>To: </span>{toEmails.join(', ')}
                </div>
              )}
              {ccEmails && ccEmails.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-3)' }}>CC: </span>{ccEmails.join(', ')}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px 14px 16px' }}>
        <EmailContent html={bodyHtml} text={body} />
        <InlineImages attachments={attachments} />
      </div>
    </div>
  );
}

// ── Sidebar building blocks ───────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: 'tabular-nums' };

function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px', borderBottom: '1px solid var(--border-md)',
    }}>
      <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
        {title}
      </span>
      {action}
    </div>
  );
}

function PropRow({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', minHeight: 38 }}>
      <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', width: 72, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onEdit && (
        <button
          onClick={onEdit}
          style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', display: 'flex', flexShrink: 0, marginLeft: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', width: 108, flexShrink: 0 }}>{label}</span>
      <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{value || '—'}</span>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

type EditModalCfg = {
  field: string;
  label: string;
  type: 'select' | 'text';
  value: string;
  options?: { value: string; label: string; color?: string }[];
};

function EditModal({
  cfg, editVal, setEditVal, onSave, onClose,
}: {
  cfg: EditModalCfg;
  editVal: string;
  setEditVal: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: 320 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Edit {cfg.label}</span>
          <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '16px' }}>
          {cfg.type === 'select' ? (
            <select
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              autoFocus
              style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            >
              {cfg.options?.map(o => (
                <option key={o.value} value={o.value} style={{ background: 'var(--bg-surface)', color: o.color ?? 'var(--text-1)' }}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') onSave(); }}
              style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            style={{ padding: '6px 16px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Check size={12} /> Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Resolution article view modal ────────────────────────────────────────────

function ResoViewModal({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const { data: article, isLoading } = useKBArticle(articleId);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderTop: '2px solid #a78bfa', width: '100%', maxWidth: 580, maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
          <FileText size={15} style={{ color: 'var(--accent-violet-fg)', marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLoading ? (
              <div style={{ height: 18, width: 200, background: 'var(--bg-elevated)', borderRadius: 3 }} />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.3 }}>
                {article?.title ?? '—'}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Resolution Note</div>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-3)' }} />
            </div>
          ) : article?.content ? (
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {article.content}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>No details provided.</div>
          )}
        </div>

        {/* Footer meta */}
        {article && (
          <div style={{ flexShrink: 0, display: 'flex', gap: 16, padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            {article.author_name && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>By <span style={{ color: 'var(--text-3)' }}>{article.author_name}</span></span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {new Date(article.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Automation Activity sidebar card ─────────────────────────────────────────

function AutomationActivityCard({ ticketRef }: { ticketRef: string }) {
  const { data: logs = [], isLoading } = useAutomationLogs({ ticket: ticketRef });
  const router = useRouter();

  if (!isLoading && logs.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
      <CardHeader
        title="Automation Activity"
        action={
          logs.length > 0 ? (
            <button
              onClick={() => router.push(`/settings/automation/logs`)}
              style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
            >
              View all
            </button>
          ) : undefined
        }
      />
      <div style={{ padding: '10px 14px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.slice(0, 5).map(log => {
              const tc = TRIGGER_COLORS[log.trigger] ?? { color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' };
              const ago = (() => {
                const diff = Date.now() - new Date(log.fired_at).getTime();
                const m    = Math.floor(diff / 60000);
                if (m < 1)    return 'just now';
                if (m < 60)   return `${m}m ago`;
                const h = Math.floor(m / 60);
                if (h < 24)   return `${h}h ago`;
                return `${Math.floor(h / 24)}d ago`;
              })();
              return (
                <div key={log.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{log.rule_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ago}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: tc.color, background: tc.bg, padding: '1px 6px' }}>
                      {TRIGGER_LABELS[log.trigger] ?? log.trigger}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {log.actions_taken.map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 3, height: 3, background: '#60a5fa', borderRadius: '50%', flexShrink: 0, display: 'inline-block' }} />
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ref    = params.id as string;

  const { user } = useAuthStore();
  const isMSP = ['msp_owner', 'msp_manager', 'msp_agent'].includes(user?.role ?? '');

  const { data: ticket, isLoading, isError } = useTicket(ref);
  const { data: agents   = [] } = useAgents(ticket?.group?.id ?? null);
  const { data: groups   = [] } = useGroups();
  const { data: orgUsers = [] } = useOrgUsers(ticket?.client_org?.id ?? '');
  const addReply             = useAddReply(ref);
  const updateTicket         = useUpdateTicket(ref);
  const addSecondaryAgent    = useAddSecondaryAgent(ref);
  const removeSecondaryAgent = useRemoveSecondaryAgent(ref);
  const createKBArticle      = useCreateKBArticle();
  const linkTicket           = useLinkTicketToArticle();
  const unlinkTicket         = useUnlinkTicketFromArticle();
  const addTimeLog           = useAddTimeLog(ref);
  const deleteTimeLog        = useDeleteTimeLog(ref);
  const mergeTicket          = useMergeTicket(ref);
  const absorbTicket         = useAbsorbTicket(ref);
  const { data: customerHistory, isLoading: customerHistoryLoading } = useCustomerHistory(ref);

  const [replyText,        setReplyText]        = useState('');
  const [replyType,        setReplyType]        = useState<'public_reply' | 'internal_note'>('public_reply');
  const [replyImages,      setReplyImages]      = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [editModal,        setEditModal]        = useState<EditModalCfg | null>(null);
  const [editVal,          setEditVal]          = useState('');
  const [requesterEditOpen, setRequesterEditOpen] = useState(false);
  const [sidebarWidth,      setSidebarWidth]      = useState(320);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [fullEditOpen, setFullEditOpen] = useState(false);
  const [fullEditForm, setFullEditForm] = useState({ subject: '', description: '', category: '', status: '', priority: '', level: '', assignee_id: '', requester_id: '' });
  const [copied,             setCopied]             = useState<'ref' | 'full' | null>(null);
  const [addingSecondary,    setAddingSecondary]    = useState(false);
  const [secondaryAgentVal,  setSecondaryAgentVal]  = useState('');

  // Time log form
  const [tlMinutes, setTlMinutes] = useState('');
  const [tlDate,    setTlDate]    = useState(() => new Date().toISOString().slice(0, 10));
  const [tlDesc,    setTlDesc]    = useState('');

  // Merge/Absorb modal
  type MergeModalState = { type: 'merge' | 'absorb'; searchQ: string; selectedRef: string };
  const [mergeModal, setMergeModal] = useState<MergeModalState | null>(null);
  const [mergeError, setMergeError] = useState('');
  const { data: mergeSearchData } = useTickets({ search: mergeModal?.searchQ || '' });
  const mergeSearchResults = mergeModal?.searchQ
    ? (mergeSearchData?.results ?? []).filter(t => t.ref !== ref)
    : [];

  // Canned picker
  const [cannedOpen, setCannedOpen] = useState(false);

  // Email panel
  const [emailPanelOpen,  setEmailPanelOpen]  = useState(false);
  const [toInput,         setToInput]         = useState('');
  const [ccInput,         setCcInput]         = useState('');
  const [bccInput,        setBccInput]        = useState('');
  const [ticketCreator,   setTicketCreator]   = useState(true);
  const [inclHistory,     setInclHistory]     = useState(false);

  // Pre-fill To with requester email once ticket loads
  useEffect(() => {
    if (ticket?.requester?.email && !toInput) {
      setToInput(ticket.requester.email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.requester?.email]);

  // Resolution article view popup (click to read full article)
  const [resoViewId,    setResoViewId]    = useState<string | null>(null);
  // Resolution edit mode (unlink articles)
  const [resoEditMode,  setResoEditMode]  = useState(false);
  const [resoRemoveIds, setResoRemoveIds] = useState<Set<string>>(new Set());
  const [resoUnlinking, setResoUnlinking] = useState(false);

  // Resolution popup
  const [resoModal,     setResoModal]     = useState<{ payload: Record<string, unknown> } | null>(null);
  const [resoTab,       setResoTab]       = useState<'write' | 'browse'>('write');
  const [resoTitle,     setResoTitle]     = useState('');
  const [resoContent,   setResoContent]   = useState('');
  const [resoSearchQ,   setResoSearchQ]   = useState('');
  const [resoSelectedId, setResoSelectedId] = useState('');
  const [resoSaving,    setResoSaving]    = useState(false);
  const [resoError,     setResoError]     = useState('');
  const { data: existingArticles = [] }   = useKBArticles('resolution', resoSearchQ || undefined);

  function openEdit(cfg: EditModalCfg) {
    setEditModal(cfg);
    setEditVal(cfg.value);
  }

  function saveEdit() {
    if (!editModal) return;
    const payload: Record<string, unknown> =
      editModal.field === 'assignee_id' || editModal.field === 'level' || editModal.field === 'group_id'
        ? { [editModal.field]: editVal || null }
        : { [editModal.field]: editVal };
    if (editModal.field === 'status' && (editVal === 'solved' || editVal === 'closed') && !['solved', 'closed'].includes(ticket?.status ?? '')) {
      setEditModal(null);
      openResoModal(payload);
      return;
    }
    updateTicket.mutate(payload);
    setEditModal(null);
  }

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      setSidebarWidth(Math.max(220, Math.min(520, dragRef.current.startWidth - delta)));
    }
    function onMouseUp() {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function openFullEdit() {
    if (!ticket) return;
    setFullEditForm({
      subject:      ticket.subject,
      description:  ticket.description,
      category:     ticket.category,
      status:       ticket.status,
      priority:     ticket.priority,
      level:        ticket.level ?? '',
      assignee_id:  ticket.assignee?.id ?? '',
      requester_id: ticket.requester.id ?? '',
    });
    setFullEditOpen(true);
  }

  function saveFullEdit() {
    const payload = {
      subject:      fullEditForm.subject,
      description:  fullEditForm.description,
      category:     fullEditForm.category,
      status:       fullEditForm.status,
      priority:     fullEditForm.priority,
      level:        fullEditForm.level || null,
      assignee_id:  fullEditForm.assignee_id || null,
      requester_id: fullEditForm.requester_id || null,
    };
    if ((fullEditForm.status === 'solved' || fullEditForm.status === 'closed') && !['solved', 'closed'].includes(ticket?.status ?? '')) {
      setFullEditOpen(false);
      openResoModal(payload);
      return;
    }
    updateTicket.mutate(payload, { onSuccess: () => setFullEditOpen(false) });
  }

  function openResoModal(payload: Record<string, unknown>) {
    setResoModal({ payload });
    setResoTab('write');
    setResoTitle('');
    setResoContent('');
    setResoSearchQ('');
    setResoSelectedId('');
    setResoError('');
    setResoSaving(false);
  }

  function resoCancel() {
    setResoModal(null);
  }

  function resoSkip() {
    if (!resoModal) return;
    updateTicket.mutate(resoModal.payload);
    setResoModal(null);
  }

  async function resoSave() {
    if (!resoModal || !ticket) return;
    setResoError('');

    if (resoTab === 'write') {
      if (!resoTitle.trim()) { setResoError('Resolution title is required.'); return; }
      setResoSaving(true);
      try {
        const article = await createKBArticle.mutateAsync({
          category:   'resolution',
          title:      resoTitle.trim(),
          content:    resoContent,
          status:     'published',
          visibility: 'internal',
        });
        await linkTicket.mutateAsync({ articleId: article.id, ticketRef: ticket.ref });
        updateTicket.mutate(resoModal.payload);
        setResoModal(null);
      } catch (e) {
        setResoError((e instanceof Error ? e.message : null) ?? 'Failed to save resolution.');
        setResoSaving(false);
      }
      return;
    }

    // browse tab
    if (!resoSelectedId) { setResoError('Select a resolution article first.'); return; }
    setResoSaving(true);
    try {
      await linkTicket.mutateAsync({ articleId: resoSelectedId, ticketRef: ticket.ref });
      updateTicket.mutate(resoModal.payload);
      setResoModal(null);
    } catch (e) {
      setResoError((e instanceof Error ? e.message : null) ?? 'Failed to link resolution.');
      setResoSaving(false);
    }
  }

  function copyToClipboard(text: string, key: 'ref' | 'full') {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function sendReply() {
    if (!replyText.trim() && replyImages.length === 0) return;
    const parseEmails = (s: string) => s.split(',').map(e => e.trim()).filter(Boolean);
    addReply.mutate(
      {
        type:            replyType,
        body:            replyText,
        images:          replyImages,
        to_emails:       replyType === 'public_reply' ? parseEmails(toInput)  : [],
        cc_emails:       replyType === 'public_reply' ? parseEmails(ccInput)  : [],
        bcc_emails:      replyType === 'public_reply' ? parseEmails(bccInput) : [],
        include_history: replyType === 'public_reply' && inclHistory,
      },
      {
        onSuccess: () => {
          setReplyText('');
          setReplyImages([]);
          setCcInput('');
          setBccInput('');
          setInclHistory(false);
          const reqEmail = ticket?.requester?.email ?? '';
          setToInput(reqEmail);
          setTicketCreator(true);
        },
      },
    );
  }

  function onImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setReplyImages(prev => [...prev, ...files].slice(0, 5));
    e.target.value = '';
  }

  function removeImage(idx: number) {
    setReplyImages(prev => prev.filter((_, i) => i !== idx));
  }

  function confirmMerge() {
    if (!mergeModal?.selectedRef) return;
    setMergeError('');
    const mutation = mergeModal.type === 'merge' ? mergeTicket : absorbTicket;
    mutation.mutate(mergeModal.selectedRef, {
      onSuccess: () => setMergeModal(null),
      onError:   (e: unknown) => setMergeError((e instanceof Error ? e.message : null) ?? 'Action failed.'),
    });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Loading ticket…</p>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={32} style={{ color: 'var(--border-md)' }} />
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Ticket not found</p>
        <button className="btn-primary gap-1.5" style={{ fontSize: 11 }} onClick={() => router.push('/requests')}>
          <ArrowLeft size={12} /> Back to Requests
        </button>
      </div>
    );
  }

  const status   = STATUS_CFG[ticket.status]     ?? STATUS_CFG.open;
  const priority = PRIORITY_CFG[ticket.priority] ?? PRIORITY_CFG.normal;
  const lvlColor = LEVEL_COLORS[ticket.level ?? ''] ?? 'var(--text-4)';

  const requesterName = ticket.requester.full_name;
  const orgName       = ticket.client_org?.name ?? '—';
  const orgTz         = ticket.client_org?.timezone || undefined;
  const replies       = ticket.replies ?? [];
  const msgCount      = replies.filter(r => r.type !== 'system_event').length;
  const absorbedMap   = Object.fromEntries(
    (ticket.merge_info?.absorbed_tickets ?? []).map(t => [t.ref, t.subject])
  );

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-md)' };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Back bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4" style={{ height: 38, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          className="flex items-center justify-center"
          style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px 4px 0', flexShrink: 0 }}
          onClick={() => router.push('/requests')}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={14} />
        </button>
        <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: priority.color, background: priority.bg, padding: '2px 8px' }}>{priority.label}</span>
        <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: status.color, background: status.bg, padding: '2px 8px' }}>{status.label}</span>
        {ticket.level && (
          <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: lvlColor, background: lvlColor + '18', padding: '2px 8px' }}>{ticket.level}</span>
        )}
        {ticket.sla_status === 'breached' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--accent-danger-fg)', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 8px' }}>
            <ShieldAlert size={11} /> SLA BREACHED
          </span>
        )}
        {ticket.sla_status === 'due_soon' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--accent-warn-fg)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', padding: '2px 8px' }}>
            <Shield size={11} /> SLA Due Soon
          </span>
        )}
        <div style={{ flex: 1 }} />
        {isMSP && (
          <button
            onClick={openFullEdit}
            style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '3px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
          >
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>

      {/* Split-scroll body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Left panel ───────────────────────────────────────────────────── */}
        <div className="ticket-detail-scroll flex-1 min-w-0 overflow-y-auto">
          <div style={{ padding: '4px 2px 6px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>

            {/* Card 1: Title + meta + description */}
            <div style={cardStyle}>
              <div className="p-5" style={{ borderBottom: '1px solid var(--border-md)' }}>

                {/* Row 1: ref + subject + copy buttons */}
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <span style={{ ...MONO, fontSize: 17, fontWeight: 700, color: 'var(--text-0)', flexShrink: 0 }}>{ticket.ref}</span>
                  <span style={{ ...MONO, fontSize: 17, fontWeight: 400, color: 'var(--border-strong)', flexShrink: 0 }}>—</span>
                  <h1 style={{ ...MONO, fontWeight: 700, color: 'var(--text-0)', fontSize: 17, lineHeight: 1.4, margin: 0 }}>{ticket.subject}</h1>
                  <button
                    onClick={() => copyToClipboard(ticket.ref, 'ref')}
                    title="Copy ticket number"
                    style={{ color: copied === 'ref' ? '#34d399' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    onMouseEnter={e => { if (copied !== 'ref') (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                    onMouseLeave={e => { if (copied !== 'ref') (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                  >
                    {copied === 'ref' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(`${ticket.ref} — ${ticket.subject}`, 'full')}
                    title="Copy ticket number + subject"
                    style={{ color: copied === 'full' ? '#34d399' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    onMouseEnter={e => { if (copied !== 'full') (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                    onMouseLeave={e => { if (copied !== 'full') (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                  >
                    {copied === 'full' ? <Check size={13} /> : <Clipboard size={13} />}
                  </button>
                </div>

                {/* Meta grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px',
                  paddingBottom: (ticket.description || ticket.description_html) ? 14 : 0,
                  marginBottom: (ticket.description || ticket.description_html) ? 14 : 0,
                  borderBottom: (ticket.description || ticket.description_html) ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <div className="flex items-center gap-2 py-0.5">
                    <User size={13} style={{ color: 'var(--text-1)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>Requester:</span>
                    <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{requesterName}</span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    {ticket.is_internal
                      ? <Lock size={13} style={{ color: 'var(--accent-violet-fg)', flexShrink: 0 }} />
                      : <Building2 size={13} style={{ color: 'var(--text-1)', flexShrink: 0 }} />
                    }
                    <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>Organization:</span>
                    {ticket.is_internal ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-violet-fg)', background: 'rgba(139,92,246,0.12)', padding: '2px 8px' }}>
                        Internal
                      </span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{orgName}</span>
                        {orgTz && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--accent-warn-fg)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', padding: '1px 6px', flexShrink: 0 }}>
                            <Clock size={9} /> {getTzAbbr(orgTz)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 py-0.5 flex-wrap">
                    <Calendar size={13} style={{ color: 'var(--text-1)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>Created:</span>
                    <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{formatDateWithAgo(ticket.created_at, orgTz)}</span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <Tag size={13} style={{ color: 'var(--text-1)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>Category:</span>
                    <span style={{ fontSize: 13, color: ticket.category ? 'var(--text-1)' : 'var(--text-3)' }}>{ticket.category || '—'}</span>
                  </div>
                </div>

                {/* Description */}
                {(ticket.description || ticket.description_html || ticket.attachments?.length > 0) && (
                  <div style={{ border: '1px solid var(--border-panel)', background: 'var(--bg-deep)' }}>
                    <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-panel)', background: 'var(--bg-surface)' }}>
                      <FileText size={12} style={{ color: 'var(--accent-info-fg)', flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-info-fg)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Description</span>
                    </div>
                    <div className="px-4 py-4">
                      {(ticket.description || ticket.description_html) && (
                        <EmailContent html={ticket.description_html} text={ticket.description} mono />
                      )}
                      {ticket.attachments?.length > 0 && (
                        <InlineImages attachments={ticket.attachments} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Reply editor */}
            <div style={cardStyle}>
              <div className="p-4">
                <textarea
                  value={replyText}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.endsWith('//c')) {
                      setReplyText(val.slice(0, -3));
                      setCannedOpen(true);
                    } else {
                      setReplyText(val);
                    }
                  }}
                  onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') sendReply(); }}
                  placeholder={`Type your ${replyType === 'internal_note' ? 'internal note' : 'reply'} here… (Ctrl+Enter to send)`}
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)',
                    padding: '10px 12px', minHeight: 220, fontSize: 13, fontFamily: 'inherit',
                    resize: 'vertical', display: 'block', width: '100%', outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.5)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />

                {/* Selected image previews */}
                {replyImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {replyImages.map((file, idx) => (
                      <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          style={{ width: 72, height: 56, objectFit: 'cover', border: '1px solid var(--border-md)', borderRadius: 2 }}
                        />
                        <button
                          onClick={() => removeImage(idx)}
                          style={{
                            position: 'absolute', top: -5, right: -5,
                            width: 16, height: 16, borderRadius: '50%',
                            background: '#ef4444', border: 'none', color: '#fff',
                            fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X size={9} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Email panel */}
                {isMSP && replyType === 'public_reply' && emailPanelOpen && (
                  <div style={{
                    marginTop: 8, padding: '10px 12px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-md)',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* To row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', width: 30, flexShrink: 0 }}>To</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={ticketCreator}
                          onChange={e => {
                            const checked = e.target.checked;
                            const reqEmail = ticket?.requester?.email ?? '';
                            if (checked && reqEmail) {
                              const existing = toInput.split(',').map(s => s.trim()).filter(Boolean);
                              if (!existing.includes(reqEmail)) setToInput([reqEmail, ...existing].join(', '));
                            } else if (!checked && reqEmail) {
                              setToInput(toInput.split(',').map(s => s.trim()).filter(s => s && s !== reqEmail).join(', '));
                            }
                            setTicketCreator(checked);
                          }}
                          style={{ accentColor: '#2563eb' }}
                        />
                        Ticket Creator
                      </label>
                      <input
                        type="text"
                        value={toInput}
                        onChange={e => setToInput(e.target.value)}
                        placeholder="email@example.com, another@example.com"
                        style={{
                          flex: 1, padding: '4px 8px', fontSize: 12,
                          background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                          color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                    </div>
                    {/* CC row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', width: 30, flexShrink: 0 }}>CC</span>
                      <input
                        type="text"
                        value={ccInput}
                        onChange={e => setCcInput(e.target.value)}
                        placeholder="email@example.com, another@example.com"
                        style={{
                          flex: 1, padding: '4px 8px', fontSize: 12,
                          background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                          color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                    </div>
                    {/* BCC row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', width: 30, flexShrink: 0 }}>BCC</span>
                      <input
                        type="text"
                        value={bccInput}
                        onChange={e => setBccInput(e.target.value)}
                        placeholder="email@example.com"
                        style={{
                          flex: 1, padding: '4px 8px', fontSize: 12,
                          background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                          color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                    </div>
                    {/* Include history */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={inclHistory}
                        onChange={e => setInclHistory(e.target.checked)}
                        style={{ accentColor: '#2563eb' }}
                      />
                      Include conversation history
                    </label>
                  </div>
                )}

                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex" style={{ border: '1px solid var(--border-md)' }}>
                      <button
                        onClick={() => setReplyType('public_reply')}
                        className="flex items-center gap-1.5 px-3 py-1.5 font-medium"
                        style={replyType === 'public_reply'
                          ? { background: 'var(--accent-info-bg)', color: 'var(--accent-info-fg)', fontSize: 13, fontWeight: 600, borderRight: isMSP ? '1px solid var(--border-md)' : 'none' }
                          : { background: 'transparent', color: 'var(--text-3)', fontSize: 13, borderRight: isMSP ? '1px solid var(--border-md)' : 'none' }}
                      >
                        <MessageSquare size={12} /> Public Reply
                      </button>
                      {isMSP && (
                        <button
                          onClick={() => setReplyType('internal_note')}
                          className="flex items-center gap-1.5 px-3 py-1.5 font-medium"
                          style={replyType === 'internal_note'
                            ? { background: 'var(--accent-warn-bg)', color: 'var(--accent-warn-fg)', fontSize: 13, fontWeight: 600 }
                            : { background: 'transparent', color: 'var(--text-3)', fontSize: 13 }}
                        >
                          <Lock size={12} /> Internal Note
                        </button>
                      )}
                    </div>

                    {/* Image attach button */}
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={replyImages.length >= 5}
                      title="Attach images (max 5)"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        height: 30, padding: '0 10px',
                        background: replyImages.length > 0 ? 'var(--accent-indigo-bg)' : 'var(--bg-elevated)',
                        border: `1px solid ${replyImages.length > 0 ? 'var(--accent-indigo-fg)' : 'var(--border-subtle)'}`,
                        color: replyImages.length > 0 ? 'var(--accent-indigo-fg)' : 'var(--text-2)',
                        fontSize: 13, cursor: 'pointer', fontWeight: 500,
                      }}
                      onMouseEnter={e => { if (replyImages.length < 5) (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = replyImages.length > 0 ? 'rgba(99,102,241,0.35)' : 'var(--border-md)'; }}
                    >
                      <Image size={12} />
                      {replyImages.length > 0 ? `${replyImages.length} image${replyImages.length > 1 ? 's' : ''}` : 'Image'}
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      style={{ display: 'none' }}
                      onChange={onImageSelect}
                    />

                    {/* Canned responses button */}
                    {isMSP && (
                      <button
                        onClick={() => setCannedOpen(true)}
                        title="Canned responses (or type //c)"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          height: 30, padding: '0 10px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-md)',
                          color: 'var(--text-4)',
                          fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#60a5fa'; (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                      >
                        <Archive size={12} /> Canned
                      </button>
                    )}

                    {/* Email options button */}
                    {isMSP && replyType === 'public_reply' && (
                      <button
                        onClick={() => {
                          if (!emailPanelOpen) {
                            const reqEmail = ticket?.requester?.email ?? '';
                            if (ticketCreator && reqEmail && !toInput) setToInput(reqEmail);
                          }
                          setEmailPanelOpen(o => !o);
                        }}
                        title="Email options (To / CC / BCC)"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          height: 30, padding: '0 10px',
                          background: emailPanelOpen ? 'rgba(37,99,235,0.12)' : 'var(--bg-elevated)',
                          border: `1px solid ${emailPanelOpen ? 'rgba(37,99,235,0.4)' : 'var(--border-md)'}`,
                          color: emailPanelOpen ? '#93c5fd' : 'var(--text-4)',
                          fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        }}
                        onMouseEnter={e => { if (!emailPanelOpen) { (e.currentTarget as HTMLElement).style.borderColor = '#60a5fa'; (e.currentTarget as HTMLElement).style.color = '#60a5fa'; } }}
                        onMouseLeave={e => { if (!emailPanelOpen) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; } }}
                      >
                        <Mail size={12} /> Email
                      </button>
                    )}
                  </div>

                  <button
                    className="btn-primary gap-1.5 disabled:opacity-40"
                    style={{ height: 30, paddingTop: 0, paddingBottom: 0, fontSize: 12 }}
                    disabled={(!replyText.trim() && replyImages.length === 0) || addReply.isPending}
                    onClick={sendReply}
                  >
                    {addReply.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    {addReply.isPending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Conversation */}
            <div style={cardStyle}>
              <div className="flex items-center px-5 py-2.5" style={{ borderBottom: '1px solid var(--border-md)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Conversation ({msgCount})
                </span>
              </div>
              {replies.length === 0 ? (
                <div className="py-10 text-center">
                  <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No messages yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
                  {replies
                    .slice()
                    .reverse()
                    .map(r => {
                      if (r.type === 'system_event') {
                        const m = /^Ticket (\S+) was merged into this ticket by (.+)$/.exec(r.body);
                        if (m) {
                          return (
                            <AbsorbedTicketCard
                              key={r.id}
                              sourceRef={m[1]}
                              subject={absorbedMap[m[1]] ?? ''}
                              mergedBy={m[2]}
                              mergedAt={r.created_at}
                            />
                          );
                        }
                        return <SystemEvent key={r.id} body={r.body} />;
                      }
                      return (
                        <MessageBubble
                          key={r.id}
                          type={r.type}
                          sender={r.author_name}
                          senderEmail={r.author_email ?? null}
                          authorId={r.author_id ?? null}
                          body={r.body}
                          bodyHtml={r.body_html}
                          timestamp={r.created_at}
                          isAgent={r.author_is_agent}
                          attachments={r.attachments ?? []}
                          toEmails={r.to_emails ?? []}
                          ccEmails={r.cc_emails ?? []}
                        />
                      );
                    })}
                </div>
              )}
            </div>

          </div>
        </div>

        {isMSP && <>
        {/* Vertical split divider — 1px visible rule with a wider invisible drag target */}
        <div
          style={{ width: 1, flexShrink: 0, position: 'relative', background: 'var(--border-subtle)', zIndex: 10, transition: 'background 0.15s' }}
        >
          <div
            onMouseDown={onDividerMouseDown}
            style={{ position: 'absolute', top: 0, bottom: 0, left: -3, right: -3, cursor: 'col-resize' }}
            onMouseEnter={e => { const divider = e.currentTarget.parentElement; if (divider) divider.style.background = 'rgba(37,99,235,0.45)'; }}
            onMouseLeave={e => { const divider = e.currentTarget.parentElement; if (divider) divider.style.background = 'var(--border-subtle)'; }}
          />
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────────── */}
        <div className="ticket-detail-scroll" style={{ width: sidebarWidth, flexShrink: 0, overflowY: 'auto', background: 'var(--bg-base)', padding: '4px 3px 6px 2px', display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* PROPERTIES card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <CardHeader title="Properties" />

            <PropRow label="Status"
              onEdit={() => openEdit({
                field: 'status', label: 'Status', type: 'select', value: ticket.status,
                options: Object.entries(STATUS_CFG).map(([v, c]) => ({ value: v, label: c.label, color: c.color })),
              })}
            >
              <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: status.color, background: status.bg, padding: '2px 8px' }}>
                {status.label}
              </span>
            </PropRow>

            <PropRow label="Priority"
              onEdit={() => openEdit({
                field: 'priority', label: 'Priority', type: 'select', value: ticket.priority,
                options: Object.entries(PRIORITY_CFG).map(([v, c]) => ({ value: v, label: c.label, color: c.color })),
              })}
            >
              <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: priority.color, background: priority.bg, padding: '2px 8px' }}>
                {priority.label}
              </span>
            </PropRow>

            <PropRow label="Level"
              onEdit={() => openEdit({
                field: 'level', label: 'Level', type: 'select', value: ticket.level ?? '',
                options: [
                  { value: '', label: '— None —', color: 'var(--text-1)' },
                  { value: 'L1', label: 'L1', color: 'var(--accent-info-fg)' },
                  { value: 'L2', label: 'L2', color: 'var(--accent-violet-fg)' },
                  { value: 'L3', label: 'L3', color: 'var(--accent-danger-fg)' },
                ],
              })}
            >
              {ticket.level
                ? <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: lvlColor, background: lvlColor + '1a', padding: '2px 8px' }}>{ticket.level}</span>
                : <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>—</span>
              }
            </PropRow>

            <PropRow label="Agent"
              onEdit={() => openEdit({
                field: 'assignee_id', label: 'Agent', type: 'select',
                value: ticket.assignee?.id ?? '',
                options: [
                  { value: '', label: 'Unassigned', color: 'var(--text-1)' },
                  ...agents.map(a => ({ value: a.id, label: a.full_name })),
                ],
              })}
            >
              {ticket.assignee ? (
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: getAvatarColor(ticket.assignee.full_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {getInitials(ticket.assignee.full_name)}
                  </div>
                  <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{ticket.assignee.full_name}</span>
                </div>
              ) : (
                <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Unassigned</span>
              )}
            </PropRow>

            <PropRow label="Group"
              onEdit={isMSP ? () => openEdit({
                field: 'group_id', label: 'Group', type: 'select',
                value: ticket.group?.id ?? '',
                options: [
                  { value: '', label: '— No Group —', color: 'var(--text-1)' },
                  ...groups.map(g => ({ value: g.id, label: g.name })),
                ],
              }) : undefined}
            >
              {ticket.group
                ? <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{ticket.group.name}</span>
                : <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>—</span>
              }
            </PropRow>

            {/* Secondary agents */}
            <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', minHeight: 34 }}>
                <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', width: 72, flexShrink: 0 }}>CC Agents</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(ticket.secondary_agents ?? []).map(agent => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-1"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', padding: '2px 6px 2px 4px', fontSize: 11, color: 'var(--text-1)' }}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: getAvatarColor(agent.full_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {getInitials(agent.full_name)}
                      </div>
                      <span style={{ ...MONO, fontWeight: 600 }}>{agent.full_name}</span>
                      {isMSP && (
                        <button
                          onClick={() => removeSecondaryAgent.mutate(agent.id)}
                          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0 1px 2px', color: 'var(--text-4)', marginLeft: 2 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                        >
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  ))}
                  {(ticket.secondary_agents ?? []).length === 0 && !addingSecondary && (
                    <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>—</span>
                  )}
                </div>
                {isMSP && (
                  <button
                    onClick={() => { setAddingSecondary(v => !v); setSecondaryAgentVal(''); }}
                    style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', display: 'flex', flexShrink: 0, marginLeft: 4 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>

              {addingSecondary && isMSP && (() => {
                const existingIds = new Set([
                  ticket.assignee?.id,
                  ...(ticket.secondary_agents ?? []).map(a => a.id),
                ]);
                const available = agents.filter(a => !existingIds.has(a.id));
                return (
                  <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px 14px' }}>
                    <select
                      value={secondaryAgentVal}
                      onChange={e => setSecondaryAgentVal(e.target.value)}
                      autoFocus
                      style={{ flex: 1, height: 30, padding: '0 8px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    >
                      <option value="">— Select agent —</option>
                      {available.map(a => (
                        <option key={a.id} value={a.id} style={{ background: 'var(--bg-surface)' }}>{a.full_name}</option>
                      ))}
                    </select>
                    <button
                      disabled={!secondaryAgentVal || addSecondaryAgent.isPending}
                      onClick={() => {
                        if (!secondaryAgentVal) return;
                        addSecondaryAgent.mutate(secondaryAgentVal, {
                          onSuccess: () => { setAddingSecondary(false); setSecondaryAgentVal(''); },
                        });
                      }}
                      style={{ height: 30, padding: '0 12px', background: secondaryAgentVal ? '#2563eb' : 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: secondaryAgentVal ? '#fff' : 'var(--text-4)', fontSize: 12, fontWeight: 600, cursor: secondaryAgentVal ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Check size={11} /> Add
                    </button>
                    <button
                      onClick={() => { setAddingSecondary(false); setSecondaryAgentVal(''); }}
                      style={{ height: 30, padding: '0 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-4)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Resolution articles */}
            {(ticket.linked_articles?.length ?? 0) > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 14px 10px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Resolution
                  </div>
                  {isMSP && !resoEditMode && (
                    <button
                      onClick={() => { setResoEditMode(true); setResoRemoveIds(new Set()); }}
                      title="Edit resolution"
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', background: 'transparent', border: '1px solid var(--border-panel)', borderRadius: 3, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Pencil size={9} /> Edit
                    </button>
                  )}
                  {resoEditMode && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        disabled={resoUnlinking}
                        onClick={async () => {
                          if (resoRemoveIds.size === 0) { setResoEditMode(false); return; }
                          setResoUnlinking(true);
                          try {
                            for (const articleId of resoRemoveIds) {
                              await unlinkTicket.mutateAsync({ articleId, ticketRef: ref });
                            }
                          } finally {
                            setResoUnlinking(false);
                            setResoEditMode(false);
                            setResoRemoveIds(new Set());
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'var(--accent-ok-fg)', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 3, cursor: resoUnlinking ? 'not-allowed' : 'pointer', opacity: resoUnlinking ? 0.6 : 1 }}
                      >
                        {resoUnlinking ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} Save
                      </button>
                      <button
                        disabled={resoUnlinking}
                        onClick={() => { setResoEditMode(false); setResoRemoveIds(new Set()); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'var(--text-4)', background: 'transparent', border: '1px solid var(--border-panel)', borderRadius: 3, cursor: 'pointer' }}
                      >
                        <X size={9} /> Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Article rows */}
                {ticket.linked_articles.map(article => {
                  const markedForRemoval = resoRemoveIds.has(article.id);
                  return (
                    <div key={article.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, opacity: markedForRemoval ? 0.35 : 1, transition: 'opacity 0.15s' }}>
                      <FileText size={11} style={{ color: 'var(--accent-violet-fg)', flexShrink: 0 }} />
                      <button
                        onClick={() => !resoEditMode && setResoViewId(article.id)}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                          fontSize: 12, fontWeight: 600, color: 'var(--accent-violet-fg)', lineHeight: 1.4,
                          cursor: resoEditMode ? 'default' : 'pointer',
                          textDecoration: markedForRemoval ? 'line-through' : 'none',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          padding: 0,
                        }}
                        onMouseEnter={e => { if (!resoEditMode) e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={e => { e.currentTarget.style.textDecoration = markedForRemoval ? 'line-through' : 'none'; }}
                      >
                        {article.title}
                      </button>
                      {resoEditMode && (
                        <button
                          onClick={() => {
                            setResoRemoveIds(prev => {
                              const next = new Set(prev);
                              if (next.has(article.id)) next.delete(article.id);
                              else next.add(article.id);
                              return next;
                            });
                          }}
                          title={markedForRemoval ? 'Undo remove' : 'Remove resolution'}
                          style={{
                            width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: markedForRemoval ? 'rgba(239,68,68,0.15)' : 'transparent',
                            border: `1px solid ${markedForRemoval ? 'rgba(239,68,68,0.4)' : 'var(--border-panel)'}`,
                            borderRadius: 3, cursor: 'pointer',
                            color: markedForRemoval ? '#f87171' : 'var(--text-3)',
                          }}
                          onMouseEnter={e => { if (!markedForRemoval) { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; } }}
                          onMouseLeave={e => { if (!markedForRemoval) { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border-panel)'; e.currentTarget.style.background = 'transparent'; } }}
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* ── SLA card ──────────────────────────────────────────────────── */}
          {ticket.sla_status !== 'not_applied' && (
            <div style={{ background: 'var(--bg-card)', border: `1px solid ${ticket.sla_status === 'breached' ? 'rgba(239,68,68,0.35)' : 'var(--border-md)'}` }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderBottom: '1px solid var(--border-md)',
                background: ticket.sla_status === 'breached' ? 'rgba(239,68,68,0.05)' : 'transparent',
              }}>
                <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Shield size={11} style={{ color: ticket.sla_status === 'breached' ? '#f87171' : ticket.sla_status === 'due_soon' ? '#fbbf24' : '#34d399' }} />
                  SLA
                </span>
                {(() => {
                  const cfg: Record<string, { label: string; color: string; bg: string }> = {
                    on_track:  { label: 'On Track', color: 'var(--accent-ok-fg)', bg: 'var(--accent-ok-bg)'  },
                    due_soon:  { label: 'Due Soon', color: 'var(--accent-warn-fg)', bg: 'var(--accent-warn-bg)'  },
                    breached:  { label: 'Breached', color: 'var(--accent-danger-fg)', bg: 'var(--accent-danger-bg)'   },
                    completed: { label: 'Met',      color: 'var(--accent-info-fg)', bg: 'var(--accent-info-bg)'  },
                  };
                  const s = cfg[ticket.sla_status];
                  return s ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 8px' }}>
                      {s.label}
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Policy name */}
              {ticket.sla_info && (
                <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center' }}>
                  <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', width: 72, flexShrink: 0 }}>Policy</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{ticket.sla_info.policy_name}</span>
                </div>
              )}

              {/* First response row */}
              {ticket.sla_info && (
                <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', width: 72, flexShrink: 0 }}>1st Reply</span>
                    {ticket.first_response_at ? (
                      <span style={{ fontSize: 11, color: 'var(--accent-ok-fg)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={10} /> Responded
                      </span>
                    ) : (() => {
                      const { label, overdue } = slaRelTime(ticket.sla_info!.first_response_due);
                      return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? '#f87171' : '#fbbf24' }}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: 72 }}>
                    Due {formatDate(ticket.sla_info.first_response_due)}
                  </div>
                </div>
              )}

              {/* Resolution row */}
              {ticket.sla_info && (
                <div style={{ padding: '7px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', width: 72, flexShrink: 0 }}>Resolve</span>
                    {ticket.status === 'solved' || ticket.status === 'closed' ? (
                      <span style={{ fontSize: 11, color: ticket.sla_status === 'completed' ? '#34d399' : '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {ticket.sla_status === 'completed' ? <><Check size={10} /> Met</> : <><X size={10} /> Breached</>}
                      </span>
                    ) : (() => {
                      const { label, overdue } = slaRelTime(ticket.sla_info!.resolution_due);
                      return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? '#f87171' : ticket.sla_status === 'due_soon' ? '#fbbf24' : '#34d399' }}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: 72 }}>
                    Due {formatDate(ticket.sla_info.resolution_due)}
                  </div>
                </div>
              )}

              {/* No sla_info but has a status — show minimal info */}
              {!ticket.sla_info && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                  SLA targets not available for this ticket&apos;s priority.
                </div>
              )}
            </div>
          )}

          {/* PROJECT ASSOCIATION card: Ticketing remains unchanged. */}
          <TicketProjectAssociationCard
            ticketRef={ticket.ref}
            clientOrgId={ticket.client_org?.id ?? null}
            clientOrgName={ticket.client_org?.name ?? null}
          />

          {/* REQUESTER DETAIL card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <CardHeader
              title="Requester Detail"
              action={
                <button
                  onClick={() => setRequesterEditOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: 'var(--accent-info-fg)', background: 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.2)', padding: '2px 8px', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)'; }}
                >
                  <Pencil size={10} /> Edit
                </button>
              }
            />

            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-md)' }}>
              <button
                onClick={() => ticket.requester.id && router.push(`/users/${ticket.requester.id}`)}
                className="flex items-center gap-2.5 w-full text-left"
                style={{ background: 'none', border: 'none', cursor: ticket.requester.id ? 'pointer' : 'default', padding: 0 }}
                onMouseEnter={e => { if (ticket.requester.id) (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: getAvatarColor(requesterName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {getInitials(requesterName)}
                </div>
                <div className="min-w-0">
                  <div style={{ ...MONO, fontSize: 14, fontWeight: 600, color: ticket.requester.id ? '#60a5fa' : 'var(--text-1)' }}>{requesterName}</div>
                  {ticket.requester.email && (
                    <div className="truncate" style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{ticket.requester.email}</div>
                  )}
                  {ticket.source_cc_emails?.length > 0 && (
                    <div className="truncate" style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-3)' }}>CC: </span>
                      {ticket.source_cc_emails.join(', ')}
                    </div>
                  )}
                </div>
              </button>
            </div>

            <InfoRow label="Employee ID"     value={null} />
            <InfoRow label="Reports To"      value={null} />
            <InfoRow label="Mobile"          value={null} />
            <InfoRow label="Job Title"       value={null} />
            <InfoRow label="Department"      value={null} />
            <InfoRow label="Business Impact" value={null} />
          </div>

          {/* ── TIME TRACKER card ─────────────────────────────────────────── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <CardHeader
              title="Time Tracking"
              action={
                (ticket.timelogs?.length ?? 0) > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-info-fg)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 8px' }}>
                    {formatMinutes(ticket.timelogs.reduce((s, l) => s + l.minutes, 0))} total
                  </span>
                ) : undefined
              }
            />

            {/* Per-agent summary */}
            {(ticket.timelogs?.length ?? 0) > 0 && (
              <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(
                  ticket.timelogs.reduce<Record<string, number>>((acc, l) => {
                    acc[l.agent_name] = (acc[l.agent_name] ?? 0) + l.minutes;
                    return acc;
                  }, {})
                ).map(([name, mins]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{name}</span>
                    <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--accent-info-fg)' }}>{formatMinutes(mins)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 5, marginTop: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Billable</span>
                  <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--accent-info-fg)' }}>
                    {formatMinutes(ticket.timelogs.reduce((s, l) => s + l.minutes, 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Log entries */}
            {(ticket.timelogs?.length ?? 0) > 0 && (
              <div style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 180, overflowY: 'auto' }}>
                {ticket.timelogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--text-1)', minWidth: 40 }}>{formatMinutes(log.minutes)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.agent_name}</span>
                    <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{log.date}</span>
                    {isMSP && (
                      <button
                        onClick={() => deleteTimeLog.mutate(log.id)}
                        style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 2px', flexShrink: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!(ticket.timelogs?.length ?? 0) && (
              <div style={{ padding: '12px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No time logged yet</span>
              </div>
            )}

            {/* Add time form (MSP only) */}
            {isMSP && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>Log Time</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Minutes *</label>
                    <input
                      type="number" min={1}
                      value={tlMinutes}
                      onChange={e => setTlMinutes(e.target.value)}
                      placeholder="e.g. 30"
                      style={{ width: '100%', height: 32, padding: '0 8px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Date</label>
                    <input
                      type="date"
                      value={tlDate}
                      onChange={e => setTlDate(e.target.value)}
                      style={{ width: '100%', height: 32, padding: '0 6px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={tlDesc}
                  onChange={e => setTlDesc(e.target.value)}
                  placeholder="Description (optional)"
                  style={{ width: '100%', height: 32, padding: '0 8px', marginBottom: 6, background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
                {tlMinutes && parseInt(tlMinutes) > 0 && (
                  <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--text-4)' }}>= {formatMinutes(parseInt(tlMinutes))}</div>
                )}
                <button
                  disabled={!tlMinutes || parseInt(tlMinutes) < 1 || !tlDate || addTimeLog.isPending}
                  onClick={() => {
                    if (!tlMinutes || !tlDate) return;
                    addTimeLog.mutate(
                      { minutes: parseInt(tlMinutes), date: tlDate, description: tlDesc },
                      { onSuccess: () => { setTlMinutes(''); setTlDesc(''); } },
                    );
                  }}
                  style={{ width: '100%', height: 32, background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (!tlMinutes || parseInt(tlMinutes) < 1 || !tlDate) ? 0.5 : 1 }}
                >
                  {addTimeLog.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  Log Time
                </button>
              </div>
            )}
          </div>

          {/* ── MERGE / ABSORB card ────────────────────────────────────────── */}
          {isMSP && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <CardHeader title="Absorb / Merge" />
              <div style={{ padding: '10px 14px 14px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 3, lineHeight: 1.65 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-0)' }}>Absorb:</span> this is the primary; pull a duplicate into it.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 14, lineHeight: 1.65 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-0)' }}>Merge:</span> this ticket is a duplicate; close it into another.
                </div>

                {ticket.merge_info?.status === 'secondary' ? (
                  <div style={{ padding: '8px 12px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', fontSize: 12, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-4)' }}>Absorbed by: </span>
                    <button
                      onClick={() => router.push(`/requests/${ticket.merge_info.merged_into_ref}`)}
                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-warn-fg)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      #{ticket.merge_info.merged_into_ref}
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        onClick={() => { setMergeError(''); setMergeModal({ type: 'absorb', searchQ: '', selectedRef: '' }); }}
                        style={{ height: 32, fontSize: 11, fontWeight: 600, color: 'var(--accent-info-fg)', background: 'transparent', border: '1px solid rgba(96,165,250,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <GitMerge size={11} /> Absorb
                      </button>
                      <button
                        onClick={() => { setMergeError(''); setMergeModal({ type: 'merge', searchQ: '', selectedRef: '' }); }}
                        style={{ height: 32, fontSize: 11, fontWeight: 600, color: 'var(--accent-danger-fg)', background: 'transparent', border: '1px solid rgba(248,113,113,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <GitMerge size={11} /> Merge
                      </button>
                    </div>

                    {ticket.merge_info?.status === 'primary' && (ticket.merge_info.absorbed_tickets?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                        <div style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                          Merged ({ticket.merge_info.absorbed_tickets!.length})
                        </div>
                        {ticket.merge_info.absorbed_tickets!.map(t => (
                          <button
                            key={t.ref}
                            onClick={() => router.push(`/requests/${t.ref}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '3px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--accent-info-fg)', flexShrink: 0 }}>{t.ref}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.subject}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── CUSTOMER HISTORY card ──────────────────────────────────────── */}
          {ticket.requester.id && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <CardHeader title="Customer History" />
              {customerHistoryLoading ? (
                <div style={{ padding: '14px', display: 'flex', justifyContent: 'center' }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-4)' }} />
                </div>
              ) : customerHistory ? (
                <>
                  <div style={{ padding: '8px 14px 10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 2 }}>Total</div>
                      <div style={{ ...MONO, fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{customerHistory.total}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 2 }}>Open / Pending</div>
                      <div style={{ ...MONO, fontSize: 18, fontWeight: 700, color: 'var(--accent-info-fg)' }}>{customerHistory.open_pending}</div>
                    </div>
                  </div>
                  {customerHistory.tickets.length > 0 ? (
                    <div style={{ maxHeight: 230, overflowY: 'auto' }}>
                      {customerHistory.tickets.map((t, idx) => (
                        <button
                          key={t.ref}
                          onClick={() => router.push(`/requests/${t.ref}`)}
                          style={{ display: 'flex', alignItems: 'flex-start', width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left', gap: 8 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: 'var(--text-4)', flexShrink: 0, marginTop: 2, minWidth: 16 }}>#{idx + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{t.subject}</div>
                            <div style={{ ...MONO, fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{t.ref}</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, padding: '2px 6px', color: STATUS_CFG[t.status]?.color ?? 'var(--text-3)', background: STATUS_CFG[t.status]?.bg ?? 'transparent' }}>
                            {STATUS_CFG[t.status]?.label ?? t.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>No other tickets from this requester</span>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* ── TIMELINE card ─────────────────────────────────────────────── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <CardHeader title="Timeline" />
            <div style={{ padding: '12px 14px' }}>
              {[
                { label: 'Created',  iso: ticket.created_at  },
                { label: 'Updated',  iso: ticket.updated_at  },
                { label: 'Resolved', iso: ticket.resolved_at },
              ].map(({ label, iso }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.5 }}>
                    {iso ? formatDateWithAgo(iso, orgTz) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── AUTOMATION ACTIVITY card ───────────────────────────────────── */}
          <AutomationActivityCard ticketRef={ticket.ref} />

        </div>
        </>}
      </div>

      {/* ── Property edit modal ───────────────────────────────────────────────── */}
      {editModal && (
        <EditModal cfg={editModal} editVal={editVal} setEditVal={setEditVal} onSave={saveEdit} onClose={() => setEditModal(null)} />
      )}

      {/* ── Full ticket edit modal ───────────────────────────────────────────── */}
      {fullEditOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setFullEditOpen(false); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
              <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Edit Ticket</span>
              <button onClick={() => setFullEditOpen(false)} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Subject */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Subject</label>
                <input
                  type="text"
                  value={fullEditForm.subject}
                  onChange={e => setFullEditForm(f => ({ ...f, subject: e.target.value }))}
                  style={{ width: '100%', height: 38, padding: '0 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>

              {/* Requester */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Requester</label>
                {orgUsers.length > 0 ? (
                  <select
                    value={fullEditForm.requester_id}
                    onChange={e => setFullEditForm(f => ({ ...f, requester_id: e.target.value }))}
                    style={{ width: '100%', height: 38, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                  >
                    <option value="" style={{ background: 'var(--bg-surface)' }}>— Select requester —</option>
                    {orgUsers.map(u => (
                      <option key={u.id} value={u.id} style={{ background: 'var(--bg-surface)' }}>
                        {u.full_name}{u.email ? ` (${u.email})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={ticket.requester.full_name}
                    readOnly
                    style={{ width: '100%', height: 38, padding: '0 12px', background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', color: 'var(--text-4)', fontSize: 13, outline: 'none', cursor: 'not-allowed' }}
                  />
                )}
              </div>

              {/* Status / Priority / Level / Assignee */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {([
                  { key: 'status',   label: 'Status',   opts: Object.entries(STATUS_CFG).map(([v, c]) => ({ v, l: c.label })) },
                  { key: 'priority', label: 'Priority', opts: Object.entries(PRIORITY_CFG).map(([v, c]) => ({ v, l: c.label })) },
                ] as const).map(({ key, label, opts }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>{label}</label>
                    <select
                      value={fullEditForm[key]}
                      onChange={e => setFullEditForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    >
                      {opts.map(o => <option key={o.v} value={o.v} style={{ background: 'var(--bg-surface)' }}>{o.l}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Level</label>
                  <select
                    value={fullEditForm.level}
                    onChange={e => setFullEditForm(f => ({ ...f, level: e.target.value }))}
                    style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                  >
                    <option value="" style={{ background: 'var(--bg-surface)' }}>— None —</option>
                    {['L1','L2','L3'].map(l => <option key={l} value={l} style={{ background: 'var(--bg-surface)' }}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Assignee</label>
                  <select
                    value={fullEditForm.assignee_id}
                    onChange={e => setFullEditForm(f => ({ ...f, assignee_id: e.target.value }))}
                    style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                  >
                    <option value="" style={{ background: 'var(--bg-surface)' }}>Unassigned</option>
                    {agents.map(a => <option key={a.id} value={a.id} style={{ background: 'var(--bg-surface)' }}>{a.full_name}</option>)}
                  </select>
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Category</label>
                <input
                  type="text"
                  value={fullEditForm.category}
                  onChange={e => setFullEditForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Network, Hardware…"
                  style={{ width: '100%', height: 36, padding: '0 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Description</label>
                <textarea
                  value={fullEditForm.description}
                  onChange={e => setFullEditForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue…"
                  style={{ width: '100%', minHeight: 120, padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', display: 'block' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-md)', flexShrink: 0 }}>
              <button onClick={() => setFullEditOpen(false)} style={{ padding: '6px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={saveFullEdit}
                disabled={updateTicket.isPending}
                style={{ padding: '6px 18px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {updateTicket.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolution article view popup ───────────────────────────────────────── */}
      {resoViewId && (
        <ResoViewModal articleId={resoViewId} onClose={() => setResoViewId(null)} />
      )}

      {/* ── Resolution popup ─────────────────────────────────────────────────── */}
      {resoModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Add Resolution Note</div>
                <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 2 }}>
                  Document how this ticket was resolved before closing it.
                </div>
              </div>
              <button
                onClick={resoCancel}
                style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
              {(['write', 'browse'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setResoTab(tab); setResoError(''); }}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: resoTab === tab ? '#60a5fa' : 'var(--text-4)',
                    borderBottom: resoTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                    transition: 'color 0.1s',
                  }}
                >
                  {tab === 'write' ? 'Write New' : 'Browse Existing'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

              {resoTab === 'write' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                      Resolution Title *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={resoTitle}
                      onChange={e => { setResoTitle(e.target.value); setResoError(''); }}
                      placeholder="e.g. Resolved by resetting network adapter"
                      style={{ width: '100%', height: 36, padding: '0 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                      Details
                    </label>
                    <textarea
                      value={resoContent}
                      onChange={e => setResoContent(e.target.value)}
                      placeholder="Describe the steps taken to resolve this issue…"
                      style={{ width: '100%', minHeight: 140, padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', display: 'block', lineHeight: 1.65 }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                </div>
              )}

              {resoTab === 'browse' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Search */}
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-md)', height: 34 }}>
                    <FileText size={13} style={{ color: 'var(--text-4)', margin: '0 8px', flexShrink: 0 }} />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search resolutions…"
                      value={resoSearchQ}
                      onChange={e => { setResoSearchQ(e.target.value); setResoSelectedId(''); setResoError(''); }}
                      style={{ flex: 1, height: '100%', background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                    />
                    {resoSearchQ && (
                      <button onClick={() => { setResoSearchQ(''); setResoSelectedId(''); }} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex' }}>
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Article list */}
                  <div style={{ border: '1px solid var(--border-subtle)', maxHeight: 260, overflowY: 'auto' }}>
                    {existingArticles.length === 0 ? (
                      <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                        {resoSearchQ ? 'No resolutions match your search.' : 'No resolution articles yet.'}
                      </div>
                    ) : existingArticles.map(a => {
                      const isSelected = resoSelectedId === a.id;
                      return (
                        <div
                          key={a.id}
                          onClick={() => { setResoSelectedId(a.id); setResoError(''); }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                            borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                            background: isSelected ? 'rgba(37,99,235,0.08)' : 'transparent',
                            borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                          }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#60a5fa' : 'var(--text-1)', marginBottom: 2 }}>{a.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{a.org_name} · {a.author_name ?? 'Unknown'}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: a.status === 'published' ? '#34d399' : '#fbbf24', background: a.status === 'published' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', padding: '2px 7px', flexShrink: 0 }}>
                            {a.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {resoSelectedId && (
                    <p style={{ fontSize: 11, color: 'var(--accent-ok-fg)' }}>
                      Selected — this article will be linked to ticket {ticket?.ref}.
                    </p>
                  )}
                </div>
              )}

              {resoError && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--accent-danger-fg)', fontSize: 12 }}>
                  {resoError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-md)', flexShrink: 0 }}>
              {/* Left: skip */}
              <button
                onClick={resoSkip}
                disabled={resoSaving || updateTicket.isPending}
                style={{ fontSize: 12, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', textDecoration: 'underline', opacity: (resoSaving || updateTicket.isPending) ? 0.5 : 1 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
              >
                Skip &amp; close without note
              </button>
              <div style={{ flex: 1 }} />
              {/* Right: cancel + save */}
              <button
                onClick={resoCancel}
                disabled={resoSaving}
                style={{ padding: '6px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', opacity: resoSaving ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={resoSave}
                disabled={resoSaving || updateTicket.isPending}
                style={{ padding: '6px 18px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: (resoSaving || updateTicket.isPending) ? 0.6 : 1 }}
              >
                {resoSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save &amp; Close Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Requester detail edit modal ───────────────────────────────────────── */}
      {requesterEditOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setRequesterEditOpen(false); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Requester Details</span>
              <button onClick={() => setRequesterEditOpen(false)} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: getAvatarColor(requesterName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {getInitials(requesterName)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{requesterName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{ticket.requester.email || '—'}</div>
                </div>
              </div>
              {/* Fields — read-only for now */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Mobile',          value: '' },
                  { label: 'Job Title',       value: '' },
                  { label: 'Department',      value: '' },
                  { label: 'Employee ID',     value: '' },
                  { label: 'Reports To',      value: '' },
                  { label: 'Business Impact', value: '' },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{f.label}</div>
                    <input
                      type="text"
                      defaultValue={f.value}
                      placeholder="—"
                      style={{ width: '100%', height: 32, padding: '0 8px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                    />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Full requester profile editing will be available in a future update.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={() => setRequesterEditOpen(false)} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => setRequesterEditOpen(false)} style={{ padding: '6px 16px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={12} /> Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Merge / Absorb modal ─────────────────────────────────────────────── */}
      {mergeModal && isMSP && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setMergeModal(null); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 480 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitMerge size={14} style={{ color: mergeModal.type === 'merge' ? '#f87171' : '#60a5fa' }} />
                <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {mergeModal.type === 'merge' ? `Merge ${ticket.ref}` : `Absorb into ${ticket.ref}`}
                </span>
              </div>
              <button
                onClick={() => setMergeModal(null)}
                style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Banner */}
            <div style={{ margin: '14px 18px 0 18px', padding: '10px 14px', background: mergeModal.type === 'merge' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.07)', border: `1px solid ${mergeModal.type === 'merge' ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)'}`, fontSize: 12, color: mergeModal.type === 'merge' ? '#fca5a5' : '#93c5fd', lineHeight: 1.65 }}>
              {mergeModal.type === 'merge'
                ? `${ticket.ref} (current) will be closed and linked into the ticket you select below. The selected ticket becomes the primary.`
                : `${ticket.ref} (current) stays as the primary. The ticket you select below will be closed and absorbed into this one.`
              }
            </div>

            {/* Current ticket */}
            <div style={{ margin: '12px 18px 0 18px', padding: '10px 14px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: mergeModal.type === 'merge' ? '#f87171' : '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>
                {mergeModal.type === 'merge' ? 'Secondary (closes)' : 'Primary (stays open)'}
              </div>
              <div style={{ ...MONO, fontSize: 11, fontWeight: 600, color: 'var(--text-4)', marginBottom: 2 }}>{ticket.ref}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{ticket.subject}</div>
            </div>

            {/* Search */}
            <div style={{ padding: '12px 18px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  autoFocus
                  value={mergeModal.searchQ}
                  onChange={e => setMergeModal(m => m ? { ...m, searchQ: e.target.value, selectedRef: '' } : null)}
                  placeholder={mergeModal.type === 'merge' ? 'Search for the primary ticket…' : 'Search for the duplicate to absorb…'}
                  style={{ width: '100%', height: 38, paddingLeft: 32, paddingRight: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                />
              </div>

              {mergeSearchResults.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, border: '1px solid var(--border-md)', background: 'var(--bg-base)' }}>
                  {mergeSearchResults.map(t => (
                    <button
                      key={t.ref}
                      onClick={() => setMergeModal(m => m ? { ...m, selectedRef: t.ref } : null)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: mergeModal.selectedRef === t.ref ? 'rgba(37,99,235,0.12)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => { if (mergeModal.selectedRef !== t.ref) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { if (mergeModal.selectedRef !== t.ref) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: 'var(--accent-info-fg)', flexShrink: 0 }}>{t.ref}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.subject}</span>
                      {mergeModal.selectedRef === t.ref && <Check size={12} style={{ color: 'var(--accent-info-fg)', flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}

              {mergeModal.searchQ && mergeSearchResults.length === 0 && (
                <div style={{ paddingTop: 8, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>No matching tickets found</div>
              )}

              {mergeError && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: 'var(--accent-danger-fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} /> {mergeError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                disabled={!mergeModal.selectedRef || mergeTicket.isPending || absorbTicket.isPending}
                onClick={confirmMerge}
                style={{ padding: '7px 20px', fontSize: 12, fontWeight: 600, cursor: mergeModal.selectedRef ? 'pointer' : 'default', border: 'none', background: mergeModal.selectedRef ? (mergeModal.type === 'merge' ? '#b91c1c' : '#2563eb') : 'var(--bg-elevated)', color: mergeModal.selectedRef ? '#fff' : 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {(mergeTicket.isPending || absorbTicket.isPending) && <Loader2 size={11} className="animate-spin" />}
                {mergeModal.type === 'merge' ? 'Confirm Merge' : 'Confirm Absorb'}
              </button>
              <button
                onClick={() => setMergeModal(null)}
                style={{ padding: '7px 16px', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Canned picker */}
      {cannedOpen && (
        <CannedPicker
          onSelect={body => setReplyText(prev => prev ? `${prev}\n${body}` : body)}
          onClose={() => setCannedOpen(false)}
        />
      )}

    </div>
  );
}
