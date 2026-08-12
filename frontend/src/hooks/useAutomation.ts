import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface AutomationCondition {
  field:    string;
  operator: string;
  value:    string;
}

export interface AutomationAction {
  type:  string;
  value: string;
}

export interface AutomationRule {
  id:              string;
  name:            string;
  description:     string;
  is_active:       boolean;
  priority_order:  number;
  trigger:         string;
  scope_type:      'all_orgs' | 'specific_org';
  scope_org_id:    string | null;
  scope_org_name:  string | null;
  condition_match: 'all' | 'any';
  conditions:      AutomationCondition[];
  actions:         AutomationAction[];
  stop_processing: boolean;
  created_at:      string;
  updated_at:      string;
}

// ── Static registries (mirrors backend registry.py) ──────────────────────────

export interface FieldDef {
  key:      string;
  label:    string;
  type:     'text' | 'choice' | 'bool' | 'numeric';
  choices?: string[];
}

export interface ActionDef {
  type:         string;
  label:        string;
  valueType:    'text' | 'choice' | 'group' | 'agent' | 'none';
  choices?:     string[];
  placeholder?: string;
}

export const FIELDS: FieldDef[] = [
  // Ticket scalar
  { key: 'ticket.title',            label: 'Ticket Title',              type: 'text' },
  { key: 'ticket.description',      label: 'Description',               type: 'text' },
  { key: 'ticket.status',           label: 'Status',                    type: 'choice', choices: ['open','pending','in_progress','waiting_on_customer','solved','closed'] },
  { key: 'ticket.priority',         label: 'Priority',                  type: 'choice', choices: ['low','normal','high','critical'] },
  { key: 'ticket.level',            label: 'Level',                     type: 'choice', choices: ['L1','L2','L3'] },
  { key: 'ticket.category',         label: 'Category',                  type: 'text' },
  { key: 'ticket.tags',             label: 'Tags',                      type: 'text' },
  { key: 'ticket.group',            label: 'Group Name',                type: 'text' },
  { key: 'ticket.client_org',       label: 'Organization',              type: 'text' },
  { key: 'ticket.sla_status',       label: 'SLA Status',                type: 'choice', choices: ['not_applied','on_track','due_soon','breached','completed'] },
  { key: 'ticket.has_attachment',   label: 'Has Attachment',            type: 'bool' },
  { key: 'ticket.is_assigned',      label: 'Is Assigned',               type: 'bool' },
  { key: 'ticket.assignee_name',    label: 'Assignee Name',             type: 'text' },
  // Ticket numeric
  { key: 'ticket.days_open',        label: 'Days Open',                 type: 'numeric' },
  { key: 'ticket.hours_since_update', label: 'Hours Since Last Update', type: 'numeric' },
  { key: 'ticket.reply_count',      label: 'Reply Count',               type: 'numeric' },
  // Requester
  { key: 'requester.email',         label: 'Requester Email',           type: 'text' },
  { key: 'requester.email_domain',  label: 'Requester Email Domain',    type: 'text' },
  { key: 'requester.is_vip',        label: 'Requester is VIP',          type: 'bool' },
  // Reply (meaningful for reply_added / customer_replied)
  { key: 'reply.body',              label: 'Reply Body',                type: 'text' },
  { key: 'reply.is_from_customer',  label: 'Reply is from Customer',    type: 'bool' },
];

export const OPERATORS_FOR: Record<string, string[]> = {
  text:    ['contains','not_contains','equals','not_equals','starts_with','ends_with','is_empty','is_not_empty','in_list'],
  choice:  ['equals','not_equals','is_empty','is_not_empty','in_list'],
  bool:    ['equals','not_equals'],
  numeric: ['greater_than','less_than','equals','not_equals'],
};

export const OPERATOR_LABELS: Record<string, string> = {
  contains:      'contains',
  not_contains:  'does not contain',
  equals:        'equals',
  not_equals:    'does not equal',
  starts_with:   'starts with',
  ends_with:     'ends with',
  is_empty:      'is empty',
  is_not_empty:  'is not empty',
  in_list:       'is one of (comma-separated)',
  greater_than:  'greater than',
  less_than:     'less than',
};

// Operators that don't need a value input
export const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

export const ACTIONS: ActionDef[] = [
  { type: 'set_priority',          label: 'Set Priority',                   valueType: 'choice',  choices: ['low','normal','high','critical'] },
  { type: 'set_status',            label: 'Set Status',                     valueType: 'choice',  choices: ['open','pending','in_progress','waiting_on_customer','solved','closed'] },
  { type: 'set_group',             label: 'Set Group',                      valueType: 'group' },
  { type: 'set_assignee',          label: 'Assign Agent',                   valueType: 'agent' },
  { type: 'add_tag',               label: 'Add Tag',                        valueType: 'text' },
  { type: 'remove_tag',            label: 'Remove Tag',                     valueType: 'text' },
  { type: 'set_level',             label: 'Set Level',                      valueType: 'choice',  choices: ['L1','L2','L3'] },
  { type: 'set_category',          label: 'Set Category',                   valueType: 'text' },
  { type: 'add_internal_note',     label: 'Add Internal Note',              valueType: 'text' },
  { type: 'set_due_by',            label: 'Set Due Date',                   valueType: 'text',    placeholder: '+2h  /  +1d  /  +30m' },
  { type: 'notify_agent',          label: 'Notify Agent',                   valueType: 'agent' },
  { type: 'webhook',               label: 'Send Webhook',                   valueType: 'text',    placeholder: 'https://hooks.example.com/…' },
  // Extended actions
  { type: 'escalate_priority',     label: 'Escalate Priority',              valueType: 'none' },
  { type: 'reopen_ticket',         label: 'Reopen Ticket',                  valueType: 'none' },
  { type: 'remove_assignee',       label: 'Remove Assignee',                valueType: 'none' },
  { type: 'cc_agent',              label: 'CC Agent (Secondary Assignee)',  valueType: 'agent' },
  { type: 'send_email_requester',  label: 'Send Email to Requester',        valueType: 'text',    placeholder: 'Email body text…' },
  { type: 'send_email_assignee',   label: 'Send Email to Assignee',         valueType: 'text',    placeholder: 'Email body text…' },
];

export const TRIGGER_LABELS: Record<string, string> = {
  ticket_created:    'Ticket Created',
  ticket_updated:    'Ticket Updated',
  ticket_closed:     'Ticket Closed',
  ticket_solved:     'Ticket Solved',
  ticket_assigned:   'Ticket Assigned',
  ticket_unassigned: 'Ticket Unassigned',
  priority_escalated:'Priority Escalated',
  sla_breached:      'SLA Breached',
  reply_added:       'Reply Added',
  customer_replied:  'Customer Replied',
  ticket_overdue:    'Ticket Overdue',
  ticket_stale:      'Ticket Stale (24h+)',
};

export const TRIGGER_COLORS: Record<string, { color: string; bg: string }> = {
  ticket_created:    { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  ticket_updated:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  ticket_closed:     { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  ticket_solved:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  ticket_assigned:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
  ticket_unassigned: { color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  priority_escalated:{ color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  sla_breached:      { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  reply_added:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  customer_replied:  { color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  ticket_overdue:    { color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  ticket_stale:      { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

// ── Template type ─────────────────────────────────────────────────────────────

export interface AutomationTemplate {
  id:              string;
  name:            string;
  description:     string;
  category:        string;
  trigger:         string;
  condition_match: AutomationRule['condition_match'];
  conditions:      AutomationCondition[];
  actions:         AutomationAction[];
  stop_processing: boolean;
  priority_order:  number;
}

export const TEMPLATE_CATEGORIES = [
  'All',
  'Priority Routing',
  'Group Routing',
  'SLA Escalation',
  'Customer Reply',
  'Tag Automation',
  'Defaults',
] as const;

// ── React Query hooks ─────────────────────────────────────────────────────────

export function useAutomationRules() {
  return useQuery<AutomationRule[]>({
    queryKey: ['automation-rules'],
    queryFn:  () => apiFetch('/api/automation/rules/'),
  });
}

export function useCreateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AutomationRule>) =>
      apiFetch('/api/automation/rules/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useUpdateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AutomationRule> }) =>
      apiFetch(`/api/automation/rules/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/automation/rules/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useAutomationTemplates() {
  return useQuery<AutomationTemplate[]>({
    queryKey: ['automation-templates'],
    queryFn:  () => apiFetch('/api/automation/templates/'),
    staleTime: Infinity,
  });
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export interface AutomationLog {
  id:            string;
  rule:          string | null;
  rule_name:     string;
  ticket_ref:    string;
  trigger:       string;
  actions_taken: string[];
  fired_at:      string;
}

export function useAutomationLogs(params?: { ticket?: string; rule?: string }) {
  const qs = new URLSearchParams();
  if (params?.ticket) qs.set('ticket', params.ticket);
  if (params?.rule)   qs.set('rule',   params.rule);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery<AutomationLog[]>({
    queryKey: ['automation-logs', params],
    queryFn:  () => apiFetch(`/api/automation/logs/${suffix}`),
  });
}

// ── Dry Run ───────────────────────────────────────────────────────────────────

export interface DryRunResult {
  rule_id:          string;
  rule_name:        string;
  would_fire:       boolean;
  skip_reason:      string | null;
  actions:          AutomationAction[];
  stop_processing:  boolean;
  blocked_by_stop:  boolean;
}

export function useAutomationDryRun() {
  return useMutation<DryRunResult[], unknown, { ticket_ref: string; trigger: string }>({
    mutationFn: (data) =>
      apiFetch('/api/automation/test/', { method: 'POST', body: JSON.stringify(data) }),
  });
}
