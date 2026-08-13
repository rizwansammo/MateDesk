'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Activity, Loader2, RefreshCw, ChevronRight,
  CheckCircle2, XCircle, Zap,
} from 'lucide-react';
import {
  useAutomationLogs, useAutomationRules, useAutomationDryRun,
  TRIGGER_LABELS, TRIGGER_COLORS,
  type DryRunResult,
} from '@/hooks/useAutomation';

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Dry-run modal ─────────────────────────────────────────────────────────────

function DryRunModal({ onClose }: { onClose: () => void }) {
  const dryRun = useAutomationDryRun();
  const [ticketRef, setTicketRef] = useState('');
  const [trigger,   setTrigger]   = useState('ticket_created');
  const [results,   setResults]   = useState<DryRunResult[] | null>(null);
  const [error,     setError]     = useState('');

  function handleRun() {
    if (!ticketRef.trim()) { setError('Ticket reference is required.'); return; }
    setError('');
    setResults(null);
    dryRun.mutate(
      { ticket_ref: ticketRef.trim(), trigger },
      {
        onSuccess: (data) => setResults(data),
        onError:   ()     => setError('Ticket not found or request failed.'),
      },
    );
  }

  const wouldFire = results?.filter(r => r.would_fire).length ?? 0;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 580, maxHeight: '85vh', zIndex: 301,
        background: 'var(--bg-card)', border: '1px solid var(--border-md)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Zap size={14} style={{ color: 'var(--accent-warn-fg)' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Dry Run Test</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>
              Simulate automation rules against a real ticket without applying any changes
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>
                Ticket Reference
              </label>
              <input
                value={ticketRef}
                onChange={e => setTicketRef(e.target.value)}
                placeholder="e.g. T01052024-0001"
                onKeyDown={e => e.key === 'Enter' && handleRun()}
                style={{ width: '100%', padding: '7px 10px', fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>
                Trigger
              </label>
              <select
                value={trigger}
                onChange={e => setTrigger(e.target.value)}
                style={{ width: '100%', padding: '7px 8px', fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', outline: 'none', cursor: 'pointer' }}
              >
                {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--accent-danger-fg)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
              <XCircle size={12} /> {error}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={dryRun.isPending}
            className="btn-primary gap-1.5"
            style={{ height: 32, fontSize: 12, marginBottom: results ? 20 : 0 }}
          >
            {dryRun.isPending
              ? <><Loader2 size={11} className="animate-spin" /> Running…</>
              : <><Zap size={11} /> Run Simulation</>}
          </button>

          {/* Results */}
          {results && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color: wouldFire > 0 ? '#34d399' : 'var(--text-3)' }}>
                  {wouldFire} rule{wouldFire !== 1 ? 's' : ''} would fire
                </span>
                <span>out of {results.length} active rules for this trigger</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.map(r => {
                  const tc = TRIGGER_COLORS[trigger] ?? { color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' };
                  return (
                    <div key={r.rule_id} style={{
                      padding: '10px 12px',
                      background: 'var(--bg-surface)',
                      border: `1px solid ${r.would_fire ? 'rgba(52,211,153,0.3)' : 'var(--border-subtle)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: r.would_fire ? 8 : 0 }}>
                        {r.would_fire
                          ? <CheckCircle2 size={13} style={{ color: 'var(--accent-ok-fg)', flexShrink: 0 }} />
                          : <XCircle     size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.would_fire ? 'var(--text-1)' : 'var(--text-4)' }}>
                          {r.rule_name}
                        </span>
                        {r.stop_processing && r.would_fire && (
                          <span style={{ fontSize: 10, color: 'var(--accent-warn-fg)', background: 'rgba(245,158,11,0.12)', padding: '1px 5px', marginLeft: 'auto' }}>Stop</span>
                        )}
                      </div>

                      {r.skip_reason && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 21, fontStyle: 'italic' }}>{r.skip_reason}</div>
                      )}

                      {r.would_fire && r.actions.length > 0 && (
                        <div style={{ marginLeft: 21, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {r.actions.map((a, i) => (
                            <div key={i} style={{ fontSize: 11, color: 'var(--accent-info-fg)' }}>
                              → {a.type.replace(/_/g, ' ')}{a.value ? `: ${a.value}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AutomationLogsPage() {
  const router = useRouter();
  const { data: rules = [] } = useAutomationRules();
  const [ruleFilter,    setRuleFilter]    = useState('');
  const [showDryRun,    setShowDryRun]    = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);

  const { data: logs = [], isLoading, refetch } = useAutomationLogs({
    rule: ruleFilter || undefined,
  });

  function handleRefresh() {
    setRefreshKey(k => k + 1);
    refetch();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push('/settings')}
          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
          <ArrowLeft size={14} />
        </button>
        <Activity size={14} style={{ color: 'var(--accent-info-fg)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Activity Logs</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 2 }}>— automation execution history</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowDryRun(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', fontSize: 12, background: 'none', border: '1px solid var(--border-md)', color: 'var(--text-3)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            <Zap size={12} /> Dry Run Test
          </button>
          <button
            onClick={handleRefresh}
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', fontSize: 12, background: 'none', border: '1px solid var(--border-md)', color: 'var(--text-3)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filter by rule</span>
        <select
          value={ruleFilter}
          onChange={e => setRuleFilter(e.target.value)}
          style={{ height: 28, padding: '0 8px', fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', outline: 'none', cursor: 'pointer', minWidth: 200 }}
        >
          <option value="">All rules</option>
          {rules.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {logs.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>
            Showing {logs.length} most recent entr{logs.length !== 1 ? 'ies' : 'y'}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', padding: '60px 0' }}>
            <Activity size={32} style={{ color: 'var(--border-md)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>No automation activity yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-4)', lineHeight: 1.6 }}>
              Logs appear here when automation rules fire on tickets.
              Use the Dry Run tool to test rules without affecting real data.
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 130px 1fr 130px', padding: '9px 16px', borderBottom: '1px solid var(--border-md)', background: 'var(--bg-surface)' }}>
                {['Fired At', 'Rule', 'Trigger', 'Actions Taken', 'Ticket'].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>

              {logs.map((log, i) => {
                const isLast = i === logs.length - 1;
                const tc     = TRIGGER_COLORS[log.trigger] ?? { color: 'var(--text-3)', bg: 'var(--accent-neutral-bg)' };
                return (
                  <div
                    key={log.id}
                    style={{ display: 'grid', gridTemplateColumns: '160px 1fr 130px 1fr 130px', padding: '10px 16px', alignItems: 'start', borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)', transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Fired at */}
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{timeAgo(log.fired_at)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{formatDate(log.fired_at)}</div>
                    </div>

                    {/* Rule */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', paddingRight: 12 }}>
                      {log.rule_name}
                      {!log.rule && (
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>(deleted)</span>
                      )}
                    </div>

                    {/* Trigger */}
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: tc.color, background: tc.bg, padding: '1px 7px' }}>
                        {TRIGGER_LABELS[log.trigger] ?? log.trigger}
                      </span>
                    </div>

                    {/* Actions taken */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 12 }}>
                      {log.actions_taken.map((a, ai) => (
                        <div key={ai} style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 4, height: 4, background: '#60a5fa', borderRadius: '50%', flexShrink: 0, display: 'inline-block' }} />
                          {a}
                        </div>
                      ))}
                    </div>

                    {/* Ticket ref */}
                    <div>
                      <button
                        onClick={() => router.push(`/requests/${log.ticket_ref}`)}
                        style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-info-fg)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
                      >
                        {log.ticket_ref} <ChevronRight size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showDryRun && <DryRunModal onClose={() => setShowDryRun(false)} />}
    </div>
  );
}
