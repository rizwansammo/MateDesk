export interface SLATarget {
  id?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  first_response_minutes: number;
  resolution_minutes: number;
  due_soon_minutes: number;
}

export type ScopeType = 'all_orgs' | 'specific_org' | 'after_hours';
export type ClockMode = 'real_time' | 'business_hours';
export type SLAStatus = 'not_applied' | 'on_track' | 'due_soon' | 'breached' | 'completed';

export interface SLAPolicy {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  priority_order: number;
  scope_type: ScopeType;
  scope_org: string | null;
  scope_org_name: string | null;
  clock_mode: ClockMode;
  breach_emails: string[];
  targets: SLATarget[];
  created_at: string;
  updated_at: string;
}

export interface VIPRule {
  id: string;
  name: string;
  is_active: boolean;
  notification_emails: string[];
  created_at: string;
  updated_at: string;
}
