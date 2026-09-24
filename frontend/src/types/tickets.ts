export type TicketStatus   = 'open' | 'pending' | 'in_progress' | 'waiting_on_customer' | 'solved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'critical';
export type ReplyType      = 'public_reply' | 'internal_note' | 'system_event';

export interface SupportGroup {
  id:           string;
  name:         string;
  description:  string;
  is_default:   boolean;
  agents:       { id: string; full_name: string; role: string }[];
  ticket_count: number;
  created_at:   string;
}

export type SLAStatus = 'not_applied' | 'on_track' | 'due_soon' | 'breached' | 'completed';

export interface SLAInfo {
  policy_name:        string;
  first_response_due: string;
  resolution_due:     string;
}

export interface TicketListItem {
  id:          string;   // UUID
  ref:         string;   // T{DDMMYYYY}-{XXXX}
  subject:     string;
  status:      TicketStatus;
  priority:    TicketPriority;
  level:       string;
  category:    string;
  tags:        string[];
  requester:   string;
  assignee:    string | null;
  assignee_id: string | null;
  client_org:    string | null;
  client_org_id: string | null;
  from_email:    string | null;
  due_by:      string | null;
  group_id:    string | null;
  group_name:  string | null;
  sla_status:  SLAStatus;
  is_internal: boolean;
  // null = no replies yet; true = last reply from agent; false = last reply from user
  last_reply_author_is_agent: boolean | null;
  created_at:  string;
  updated_at:  string;
}

export interface TicketAttachment {
  id:       string;
  url:      string;
  filename: string;
  size:     number;
}

export interface TicketReply {
  id:              string;
  type:            ReplyType;
  body:            string;
  body_html?:      string;
  author_name:     string;
  author_id:       string | null;
  author_email:    string | null;
  author_is_agent: boolean;
  to_emails:       string[];
  cc_emails:       string[];
  created_at:      string;
  attachments:     TicketAttachment[];
}

export interface TimeLog {
  id:          string;
  agent_name:  string;
  minutes:     number;
  date:        string;
  description: string;
  created_at:  string;
}

export interface MergeInfo {
  status:               'none' | 'primary' | 'secondary';
  merged_into_ref?:     string;
  merged_into_subject?: string;
  absorbed_tickets?:    { ref: string; subject: string }[];
}

export interface CustomerHistoryTicket {
  ref:        string;
  subject:    string;
  status:     string;
  created_at: string;
}

export interface CustomerHistory {
  total:        number;
  open_pending: number;
  tickets:      CustomerHistoryTicket[];
}

export interface TicketDetail {
  id:               string;
  ref:              string;
  subject:          string;
  description:      string;
  description_html?: string;
  status:           TicketStatus;
  priority:         TicketPriority;
  level:            string;
  category:         string;
  tags:             string[];
  due_by:           string | null;
  resolved_at:      string | null;
  first_response_at: string | null;
  sla_status:       SLAStatus;
  sla_info:         SLAInfo | null;
  requester:        { id: string | null; full_name: string; email: string };
  assignee:         { id: string; full_name: string; role: string } | null;
  secondary_agents: { id: string; full_name: string; role: string }[];
  client_org:       { id: string; name: string; timezone?: string } | null;
  is_internal:      boolean;
  source_cc_emails: string[];
  group:            { id: string; name: string } | null;
  replies:          TicketReply[];
  attachments:      TicketAttachment[];
  timelogs:         TimeLog[];
  merge_info:       MergeInfo;
  linked_articles:  { id: string; title: string }[];
  created_at:       string;
  updated_at:       string;
}

export interface ClientOrg {
  id:   string;
  name: string;
}

export interface Agent {
  id:        string;
  full_name: string;
  role:      string;
}

export interface TicketStats {
  open:           number;
  pending:        number;
  in_progress:    number;
  solved_today:   number;
  total_open:     number;
  unassigned:     number;
  overdue:        number;
  due_today:      number;
  waiting_client: number;
  closed:         number;
  total:          number;
  priority_breakdown: { low: number; normal: number; high: number; critical: number };
}

export interface AgentStat {
  id:             string;
  full_name:      string;
  role:           string;
  open:           number;
  waiting_client: number;
  overdue:        number;
}

export interface ActivityItem {
  id:         string;
  ticket_ref: string;
  subject:    string;
  type:       string;
  body:       string;
  author:     string;
  created_at: string;
}

export interface VolumeDay {
  date:      string;
  inbound:   number;
  completed: number;
}

export interface PaginatedTickets {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  TicketListItem[];
}
