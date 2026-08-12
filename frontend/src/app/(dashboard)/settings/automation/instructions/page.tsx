'use client';

import { Zap, BookOpen, GitBranch, Layers, Play, Lightbulb } from 'lucide-react';

// ── Shared styles ─────────────────────────────────────────────────────────────

const CODE: React.CSSProperties = {
  display: 'block',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-md)',
  padding: '14px 16px',
  fontSize: 12,
  color: '#e2e8f0',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  lineHeight: 1.7,
  whiteSpace: 'pre',
  overflowX: 'auto',
};

const BADGE_FIELD:  React.CSSProperties = { fontSize: 11, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', padding: '1px 6px', fontFamily: 'monospace' };
const BADGE_OP:     React.CSSProperties = { fontSize: 11, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '1px 6px', fontFamily: 'monospace' };
const BADGE_ACTION: React.CSSProperties = { fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.12)',  padding: '1px 6px', fontFamily: 'monospace' };

const TH: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-md)', background: 'var(--bg-surface)' };
const TD: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--text-2)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' };

function Section({ icon: Icon, color, title, children }: { icon: React.ElementType; color: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border-md)' }}>
        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, border: `1px solid ${color}35` }}>
          <Icon size={15} strokeWidth={1.8} style={{ color }} />
        </div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '11px 14px', background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.2)', marginBottom: 16 }}>
      <Lightbulb size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

function ExampleRule({ title, description, code }: { title: string; description: string; code: string }) {
  return (
    <div style={{ marginBottom: 24, border: '1px solid var(--border-md)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-md)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{description}</div>
      </div>
      <code style={CODE}>{code}</code>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AutomationInstructionsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Page header */}
      <div style={{ flexShrink: 0, padding: '16px 32px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <BookOpen size={16} style={{ color: '#f59e0b' }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Custom Rules — Instructions</div>
          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 1 }}>Complete guide to building automation rules for your helpdesk</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {/* ── Overview ── */}
          <Section icon={Zap} color="#f59e0b" title="What Are Custom Rules?">
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 12 }}>
              Custom Rules are <strong style={{ color: 'var(--text-1)' }}>automated IF → THEN workflows</strong> that execute whenever something happens to a ticket.
              You define the trigger (when to run), the conditions (whether to run), and the actions (what to do).
              Rules fire instantly — no manual intervention needed.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 12 }}>
              Every rule has three parts:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: '1. Trigger', desc: 'When to check the rule — ticket created, updated, or a reply added.', color: '#34d399' },
                { label: '2. Conditions', desc: 'IF this is true — filters so the rule only fires on matching tickets.', color: '#60a5fa' },
                { label: '3. Actions', desc: 'THEN do this — assign agent, set priority, add tag, note, and more.', color: '#f59e0b' },
              ].map(item => (
                <div key={item.label} style={{ padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              ))}
            </div>
            <Note>
              Conditions are optional. A rule with no conditions fires on <em>every</em> event that matches its trigger. Always add at least one condition unless you intentionally want the rule to always run.
            </Note>
          </Section>

          {/* ── Triggers ── */}
          <Section icon={Play} color="#34d399" title="Triggers — When Does the Rule Run?">
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
              Choose one of three triggers for each rule:
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={TH}>Trigger</th>
                  <th style={TH}>Fires When…</th>
                  <th style={TH}>Good For…</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={TD}><span style={{ fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '2px 8px', fontWeight: 700 }}>Ticket Created</span></td>
                  <td style={TD}>A new ticket is submitted (by email, portal, or agent)</td>
                  <td style={TD}>Auto-routing, priority assignment, initial tagging</td>
                </tr>
                <tr>
                  <td style={TD}><span style={{ fontSize: 11, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', padding: '2px 8px', fontWeight: 700 }}>Ticket Updated</span></td>
                  <td style={TD}>Any field on the ticket changes (status, priority, assignee, etc.)</td>
                  <td style={TD}>SLA escalations, status-based tagging, re-routing on priority change</td>
                </tr>
                <tr style={{ borderBottom: 'none' }}>
                  <td style={{ ...TD, borderBottom: 'none' }}><span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', fontWeight: 700 }}>Reply Added</span></td>
                  <td style={{ ...TD, borderBottom: 'none' }}>A new public reply or internal note is posted on the ticket</td>
                  <td style={{ ...TD, borderBottom: 'none' }}>Auto-reopen, customer follow-up detection, VIP alert on reply</td>
                </tr>
              </tbody>
            </table>
            <Note>
              One rule = one trigger. To react to both ticket creation and replies, create two separate rules with the same conditions and actions.
            </Note>
          </Section>

          {/* ── Conditions ── */}
          <Section icon={GitBranch} color="#60a5fa" title="Conditions — Available Fields &amp; Operators">
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
              Each condition row is: <span style={BADGE_FIELD}>Field</span> + <span style={BADGE_OP}>Operator</span> + <em>Value</em>.
              Multiple conditions use <strong style={{ color: 'var(--text-1)' }}>ALL</strong> (every condition must pass) or <strong style={{ color: 'var(--text-1)' }}>ANY</strong> (at least one must pass).
            </p>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Available Fields</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr>
                  <th style={TH}>Field</th>
                  <th style={TH}>Type</th>
                  <th style={TH}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['ticket.title',          'Text',   'The subject/title of the ticket'],
                  ['ticket.description',    'Text',   'The body/description of the ticket'],
                  ['ticket.status',         'Choice', 'open · pending · in_progress · waiting_on_customer · solved · closed'],
                  ['ticket.priority',       'Choice', 'low · normal · high · critical'],
                  ['ticket.level',          'Choice', 'L1 · L2 · L3'],
                  ['ticket.category',       'Text',   'The category field on the ticket'],
                  ['ticket.tags',           'Text',   'Searches within the ticket\'s tag list (space-joined)'],
                  ['ticket.client_org',     'Text',   'The name of the client organization on the ticket'],
                  ['ticket.sla_status',     'Choice', 'not_applied · on_track · due_soon · breached · completed'],
                  ['ticket.has_attachment', 'Bool',   'Yes/No — whether the ticket has any file attachments'],
                  ['requester.email',       'Text',   'Full email address of the ticket requester'],
                  ['requester.email_domain','Text',   'Domain part of requester email — e.g. "gmail.com"'],
                  ['requester.is_vip',      'Bool',   'Yes/No — whether the requester is marked as a VIP user'],
                ].map(([field, type, desc]) => (
                  <tr key={field as string}>
                    <td style={TD}><span style={BADGE_FIELD}>{field}</span></td>
                    <td style={{ ...TD, color: type === 'Bool' ? '#a78bfa' : type === 'Choice' ? '#f59e0b' : 'var(--text-3)' }}>{type}</td>
                    <td style={{ ...TD, color: 'var(--text-4)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Available Operators</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={TH}>Operator</th>
                  <th style={TH}>Works With</th>
                  <th style={TH}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['contains',     'Text',          'Case-insensitive substring match'],
                  ['does not contain', 'Text',      'Case-insensitive substring not present'],
                  ['equals',       'Text · Choice · Bool', 'Exact match (case-insensitive for text)'],
                  ['does not equal','Text · Choice · Bool','Not an exact match'],
                  ['starts with',  'Text',          'Value must appear at the start'],
                  ['ends with',    'Text',          'Value must appear at the end'],
                  ['is empty',     'Text · Choice', 'Field has no value — no value input needed'],
                  ['is not empty', 'Text · Choice', 'Field has a value — no value input needed'],
                  ['is one of',    'Text · Choice', 'Comma-separated list; matches if field equals any item'],
                ].map(([op, works, notes]) => (
                  <tr key={op as string}>
                    <td style={TD}><span style={BADGE_OP}>{op}</span></td>
                    <td style={{ ...TD, color: 'var(--text-3)' }}>{works}</td>
                    <td style={{ ...TD, color: 'var(--text-4)' }}>{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ── Actions ── */}
          <Section icon={Layers} color="#f59e0b" title="Actions — What Can Be Done">
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
              Actions run in the order you add them. Multiple actions can run in a single rule.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={TH}>Action</th>
                  <th style={TH}>Value</th>
                  <th style={TH}>What It Does</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Set Priority',      'low · normal · high · critical',  'Changes the ticket priority'],
                  ['Set Status',        'open · pending · in_progress · waiting_on_customer · solved · closed', 'Changes the ticket status'],
                  ['Set Group',         'Pick from dropdown',              'Assigns the ticket to a support group'],
                  ['Assign Agent',      'Pick from dropdown',              'Sets the ticket assignee'],
                  ['Add Tag',           'Any text',                        'Appends a tag to the ticket\'s tag list'],
                  ['Remove Tag',        'Any text',                        'Removes a specific tag if it exists'],
                  ['Set Level',         'L1 · L2 · L3',                   'Sets the support tier level'],
                  ['Set Category',      'Any text',                        'Sets the ticket category'],
                  ['Add Internal Note', 'Any text',                        'Creates a private internal note (not visible to clients). Prefix "[Automation]" is added automatically.'],
                ].map(([action, value, desc]) => (
                  <tr key={action as string}>
                    <td style={TD}><span style={BADGE_ACTION}>{action}</span></td>
                    <td style={{ ...TD, color: 'var(--text-4)', fontSize: 11 }}>{value}</td>
                    <td style={{ ...TD, color: 'var(--text-4)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ── Example Rules ── */}
          <Section icon={BookOpen} color="#8b5cf6" title="Example Rules">
            <Note>
              The examples below use OrgX, OrgY as placeholder organization names. Replace these with your actual client names when building real rules.
            </Note>

            <ExampleRule
              title="Example 1 — Auto-escalate urgent tickets"
              description="When a new ticket contains urgent keywords in its title, automatically set priority to Critical and add an escalation tag."
              code={`Trigger:     Ticket Created
Conditions:  Match ANY of:
               ticket.title    contains   "urgent"
               ticket.title    contains   "emergency"
               ticket.title    contains   "critical"
               ticket.title    contains   "down"

Actions:
  1. Set Priority  →  critical
  2. Add Tag       →  escalated
  3. Add Internal Note  →  "Auto-escalated due to urgent keyword in title"`}
            />

            <ExampleRule
              title="Example 2 — Route tickets by organization"
              description="Tickets from OrgX always go to the Network support group because that org only submits network-related requests."
              code={`Trigger:     Ticket Created
Conditions:  Match ALL of:
               ticket.client_org   equals   "OrgX"

Actions:
  1. Set Group  →  Network Team
  2. Add Tag    →  orgx-routing`}
            />

            <ExampleRule
              title="Example 3 — VIP customer priority boost"
              description="Any ticket from a VIP requester gets bumped to High priority automatically."
              code={`Trigger:     Ticket Created
Conditions:  Match ALL of:
               requester.is_vip   equals   Yes

Actions:
  1. Set Priority  →  high
  2. Add Tag       →  vip-ticket`}
            />

            <ExampleRule
              title="Example 4 — Auto-reopen on customer reply"
              description="When a customer replies to a solved ticket, reopen it so it doesn't get lost."
              code={`Trigger:     Reply Added
Conditions:  Match ALL of:
               ticket.status   equals   "solved"

Actions:
  1. Set Status   →  open
  2. Add Tag      →  reopened
  3. Add Internal Note  →  "Automatically reopened — customer replied after solved status"`}
            />

            <ExampleRule
              title="Example 5 — SLA breach escalation"
              description="When a ticket's SLA is breached, tag it and add an internal note for the team."
              code={`Trigger:     Ticket Updated
Conditions:  Match ALL of:
               ticket.sla_status   equals   "breached"

Actions:
  1. Add Tag           →  sla-breached
  2. Set Priority      →  high
  3. Add Internal Note →  "SLA breached — immediate attention required"`}
            />

            <ExampleRule
              title="Example 6 — External email domain tagging"
              description="Tag tickets from free email providers so the team knows the requester is not a managed client."
              code={`Trigger:     Ticket Created
Conditions:  Match ANY of:
               requester.email_domain   equals   "gmail.com"
               requester.email_domain   equals   "outlook.com"
               requester.email_domain   equals   "yahoo.com"
               requester.email_domain   equals   "hotmail.com"

Actions:
  1. Add Tag      →  external-user
  2. Set Category →  External Inquiry`}
            />

            <ExampleRule
              title="Example 7 — Multi-org VPN routing"
              description="Tickets from OrgX or OrgY with 'VPN' in the title go to the Network group at L2."
              code={`Trigger:     Ticket Created
Conditions:  Match ALL of:
               ticket.title      contains    "VPN"
               ticket.client_org is one of   "OrgX,OrgY"

Actions:
  1. Set Group  →  Network Team
  2. Set Level  →  L2
  3. Add Tag    →  vpn-issue`}
            />

            <ExampleRule
              title="Example 8 — Catch-all: unassigned critical tickets"
              description="If a critical ticket is still unassigned after creation, add an internal note to prompt manual assignment."
              code={`Trigger:     Ticket Created
Conditions:  Match ALL of:
               ticket.priority   equals     "critical"
               ticket.assignee   is empty

Actions:
  1. Add Tag           →  needs-assignment
  2. Add Internal Note →  "Critical ticket created with no assignee — please assign immediately"`}
            />
          </Section>

          {/* ── Execution order ── */}
          <Section icon={Layers} color="#94a3b8" title="Execution Order &amp; Stop Processing">
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 12 }}>
              Rules with the <strong style={{ color: 'var(--text-1)' }}>same trigger</strong> run in <strong style={{ color: 'var(--text-1)' }}>Run Order</strong> sequence (lowest number first).
              After each rule fires, the ticket is re-read so subsequent rules see the updated state.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
              Enabling <strong style={{ color: 'var(--text-1)' }}>Stop Processing</strong> on a rule means no further rules run for that event after this one fires — useful for catch-all rules at the end of your list.
            </p>
            <div style={{ padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-md)', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>Example execution flow for a new ticket:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { order: 1,  rule: 'VIP Priority Boost',        fires: true,  stop: false, reason: 'Conditions matched' },
                  { order: 5,  rule: 'OrgX Network Routing',      fires: false, stop: false, reason: 'Scope: OrgX only — ticket is from OrgY' },
                  { order: 10, rule: 'Auto-escalate Keywords',     fires: true,  stop: false, reason: 'Title contains "urgent"' },
                  { order: 20, rule: 'Unassigned Critical Catch',  fires: true,  stop: true,  reason: 'Priority=critical, no assignee → STOP' },
                  { order: 30, rule: 'Generic Tag Rule',           fires: false, stop: false, reason: 'Skipped — rule #20 stopped processing' },
                ].map(row => (
                  <div key={row.order} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ width: 28, color: 'var(--text-5)', flexShrink: 0 }}>#{row.order}</span>
                    <span style={{ flex: 1, color: row.fires ? 'var(--text-1)' : 'var(--text-5)' }}>{row.rule}</span>
                    <span style={{ fontSize: 11, padding: '1px 7px', color: row.fires ? '#34d399' : 'var(--text-5)', background: row.fires ? 'rgba(52,211,153,0.1)' : 'transparent', border: `1px solid ${row.fires ? 'rgba(52,211,153,0.3)' : 'var(--border-subtle)'}` }}>
                      {row.fires ? '✓ Fired' : '— Skipped'}
                    </span>
                    {row.stop && <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '1px 5px' }}>STOP</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-5)', maxWidth: 260 }}>{row.reason}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 14, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', marginBottom: 6 }}>Best Practices</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8 }}>
                  <li>Use low Run Order numbers (1–5) for VIP or critical-priority rules</li>
                  <li>Use high Run Order numbers (90–99) for catch-all / default rules</li>
                  <li>Always add a description — it helps teammates understand intent</li>
                  <li>Deactivate rules (toggle off) before deleting to test the impact</li>
                  <li>Use <strong>Stop Processing</strong> sparingly — only on true catch-alls</li>
                </ul>
              </div>
              <div style={{ padding: 14, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>Common Pitfalls</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8 }}>
                  <li>A rule with no conditions fires on <em>every</em> event — add conditions unless intentional</li>
                  <li>Ticket Updated fires often — be specific with conditions to avoid noise</li>
                  <li>Set Group and Assign Agent store UUIDs — always use the dropdowns, not free text</li>
                  <li>Duplicate Run Order numbers are allowed — rules with equal order run alphabetically</li>
                </ul>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
