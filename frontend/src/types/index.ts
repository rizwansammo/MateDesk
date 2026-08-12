// ── Tenant ──────────────────────────────────────────────────────────────

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  domain?: string;
  logo?: string;
  is_active: boolean;
  created_at: string;
  owner_email: string;
}

// ── Users & Roles ────────────────────────────────────────────────────────

export type TenantRole = 'owner' | 'manager' | 'agent';
export type ClientRole = 'client_owner' | 'end_user';
export type UserRole = TenantRole | ClientRole;

export interface User {
  id: number;
  tenant_id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  job_title?: string;
  department?: string;
  avatar?: string;
  is_active: boolean;
  date_joined: string;
  last_login?: string;
  client_organization?: number;
  client_organization_name?: string;
  is_vip?: boolean;
}

// ── Client Organizations ─────────────────────────────────────────────────

export interface ClientOrganization {
  id: number;
  tenant_id: number;
  name: string;
  domain?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  user_count?: number;
  open_ticket_count?: number;
}

// ── Tickets ──────────────────────────────────────────────────────────────

export type TicketStatus =
  | 'open'
  | 'pending'
  | 'in_progress'
  | 'actioned'
  | 'solved'
  | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketSource  = 'portal' | 'email' | 'agent';
export type TicketLevel   = 'L1' | 'L2' | 'L3';
export type MessageType   = 'public_reply' | 'internal_note' | 'system_event' | 'email_in';

export interface Ticket {
  id: number;
  tenant_id: number;
  ticket_number: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  level: TicketLevel;
  source: TicketSource;
  category?: string;
  requester_id?: number;
  requester_name?: string;
  requester_email?: string;
  assigned_agent_id?: number;
  assigned_agent_name?: string;
  client_organization_id?: number;
  client_organization_name?: string;
  created_at: string;
  updated_at: string;
  due_by?: string;
  closed_at?: string;
  first_response_at?: string;
  has_attachments: boolean;
  is_overdue: boolean;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  tenant_id: number;
  sender_id?: number;
  sender_name: string;
  sender_email: string;
  sender_type: 'agent' | 'client' | 'system';
  message_type: MessageType;
  body_text: string;
  body_html?: string;
  created_at: string;
  attachments?: Attachment[];
}

// ── Attachments ──────────────────────────────────────────────────────────

export interface Attachment {
  id: number;
  file_url: string;
  filename: string;
  size: number;
  content_type: string;
  uploaded_at: string;
}

// ── Notifications ────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: number;
  tenant_id: number;
  user_id: number;
  title: string;
  message?: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  ticket_id?: number;
  ticket_number?: string;
}

// ── Dashboard ────────────────────────────────────────────────────────────

export interface DashboardSummary {
  total_tickets: number;
  open_tickets: number;
  pending_tickets: number;
  in_progress: number;
  solved_today: number;
  overdue: number;
  unassigned: number;
}

// ── API Pagination ────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
