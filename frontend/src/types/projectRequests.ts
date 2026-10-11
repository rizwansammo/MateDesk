export type ProjectRequestKind = 'web_development' | 'app_development' | 'website_redesign' | 'infrastructure' | 'other';
export type ProjectRequestStatus = 'submitted' | 'under_review' | 'awaiting_details' | 'approved' | 'rejected' | 'converted';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'BDT';

export interface ProjectRequest {
  id: string;
  ticket_ref: string;
  name: string;
  kind: ProjectRequestKind;
  description: string;
  requirements: string;
  budget: string | null;
  budget_currency: Currency;
  expected_date: string | null;
  status: ProjectRequestStatus;
  client_org: string;
  requested_by: string | null;
  assigned_agent: string | null;
  assigned_agent_id: string | null;
  converted_project_id: string | null;
  created_at: string;
  updated_at: string;
  can_review: boolean;
  can_convert: boolean;
}
export type WorkQueueKind = 'ticket' | 'project_request' | 'project';
export type WorkQueueFilter = 'all' | 'tickets' | 'project_requests' | 'projects';
export interface WorkQueueItem {
  id: string;
  kind: WorkQueueKind;
  ref: string;
  title: string;
  client_org: string;
  status: string;
  assigned_to: string | null;
  assigned_to_me: boolean;
  priority: string | null;
  href: string;
  created_at: string;
  updated_at: string;
}
export interface WorkQueuePage {
  count: number;
  page: number;
  page_size: number;
  results: WorkQueueItem[];
}
export interface ProjectCapabilities {
  can_create_projects: boolean;
  can_manage_agent_permissions: boolean;
}
export interface ProjectAgentPermission {
  id: string;
  name: string;
  email: string;
  can_create_projects: boolean;
}
