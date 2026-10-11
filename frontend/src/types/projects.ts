export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectVisibility = 'internal' | 'client';
export type ProjectRole = 'manager' | 'contributor' | 'viewer' | 'client_reviewer';
export type MilestoneStatus = 'planned' | 'in_progress' | 'completed';
export type WorkItemKind = 'feature' | 'task' | 'bug' | 'improvement';
export type WorkItemStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type WorkItemPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkVisibility = 'internal' | 'client';

export interface Project {
  id: string;
  client_org: string;
  client_org_name: string;
  my_role: ProjectRole | null;
  can_manage: boolean;
  can_edit: boolean;
  key: string;
  name: string;
  description: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProjectMember {
  id: string;
  user: string;
  user_name: string;
  user_email: string;
  role: ProjectRole;
  created_at: string;
}
export interface ProjectMilestone {
  id: string;
  name: string;
  description: string;
  status: MilestoneStatus;
  visibility: WorkVisibility;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}
export interface WorkItem {
  id: string;
  project: string;
  ref: string;
  number: number;
  milestone_id: string | null;
  title: string;
  description: string;
  kind: WorkItemKind;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  visibility: WorkVisibility;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}
export interface WorkItemComment {
  id: string;
  source?: 'web' | 'email';
  author: string | null;
  author_name: string | null;
  body: string;
  visibility: WorkVisibility;
  created_at: string;
}
export interface CreateProject {
  client_org_id: string;
  key: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  start_date?: string | null;
  due_date?: string | null;
}
export type UpdateProject = Partial<Pick<Project, 'name' | 'description' | 'status' | 'visibility' | 'start_date' | 'due_date'>>;
export type CreateMilestone = Pick<ProjectMilestone, 'name'> & Partial<Pick<ProjectMilestone, 'description' | 'status' | 'visibility' | 'due_date' | 'position'>>;
export type UpdateMilestone = Partial<Pick<ProjectMilestone, 'name' | 'description' | 'status' | 'visibility' | 'due_date' | 'position'>>;
export type CreateWorkItem = Pick<WorkItem, 'title'> & Partial<Pick<WorkItem, 'description' | 'kind' | 'status' | 'priority' | 'visibility' | 'milestone_id' | 'assignee_id' | 'due_date' | 'position'>>;
export type UpdateWorkItem = Partial<Pick<WorkItem, 'title' | 'description' | 'kind' | 'status' | 'priority' | 'visibility' | 'milestone_id' | 'assignee_id' | 'due_date' | 'position'>>;
