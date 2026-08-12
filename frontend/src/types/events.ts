export type EventStatus = 'pending' | 'completed';

export interface EventAgent {
  id:        string;
  full_name: string;
  role:      string;
}

export interface CalendarEvent {
  id:                     string;
  title:                  string;
  description:            string;
  event_dt:               string;   // ISO datetime
  status:                 EventStatus;
  creator_name:           string | null;
  assigned_agents:        EventAgent[];
  linked_ticket_ref:      string | null;
  linked_ticket_subject:  string | null;
  created_at:             string;
  updated_at:             string;
}
