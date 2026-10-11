export interface TicketLinkedProject {
  id: string;
  key: string;
  name: string;
  client_org_id: string;
}
export interface TicketLinkedWorkItem {
  id: string;
  ref: string;
  title: string;
  kind: string;
  status: string;
}
export interface TicketProjectAssociation {
  linked: boolean;
  project: TicketLinkedProject | null;
  source?: 'manual' | 'automation';
  can_edit: boolean;
  work_items: TicketLinkedWorkItem[];
}
export interface WorkItemSupportTicket {
  ref: string;
  subject: string;
  status: string;
}
export interface CreatedTicketWorkItem {
  id: string;
  ref: string;
  title: string;
  project_id: string;
}
