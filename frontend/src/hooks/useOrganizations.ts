import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface BusinessHoursDay {
  enabled:    boolean;
  start_time: string; // "HH:MM"
  end_time:   string; // "HH:MM"
}

export interface BusinessHours {
  monday:    BusinessHoursDay;
  tuesday:   BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday:  BusinessHoursDay;
  friday:    BusinessHoursDay;
  saturday:  BusinessHoursDay;
  sunday:    BusinessHoursDay;
}

export interface ClientOrg {
  id:             string;
  name:           string;
  domain:         string;
  contact_name:   string;
  contact_email:  string;
  phone:          string;
  address:        string;
  timezone:       string;
  is_active:      boolean;
  created_at:     string;
  total_tickets:  number;
  user_count:     number;
  business_hours: Partial<BusinessHours>;
}

export interface OrgUser {
  id:            string;
  full_name:     string;
  email:         string;
  role:          string;
  job_title:     string;
  department:    string;
  phone:         string;
  is_active:     boolean;
  date_joined:   string;
  total_tickets: number;
  open_tickets:  number;
}

export interface UserProfile extends OrgUser {
  first_name:      string;
  last_name:       string;
  org_id:          string | null;
  org_name:        string | null;
  is_msp_staff:    boolean;
  solved_tickets:  number;
  closed_tickets:  number;
  overdue_tickets: number;
  employee_id:     string;
  reports_to:      string;
  business_impact: string;
}

export function useOrganizations(search?: string) {
  return useQuery({
    queryKey: ['organizations', search ?? ''],
    queryFn:  () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch<ClientOrg[]>(`/api/organizations/${qs}`);
    },
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: ['organization', id],
    queryFn:  () => apiFetch<ClientOrg>(`/api/organizations/${id}/`),
    enabled:  !!id,
  });
}

export function useOrgUsers(id: string) {
  return useQuery({
    queryKey: ['org-users', id],
    queryFn:  () => apiFetch<OrgUser[]>(`/api/organizations/${id}/users/`),
    enabled:  !!id,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ClientOrg>) =>
      apiFetch<ClientOrg>('/api/organizations/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ClientOrg> }) =>
      apiFetch<ClientOrg>(`/api/organizations/${id}/`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['organization', id] });
    },
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteUsers }: { id: string; deleteUsers: boolean }) =>
      apiFetch(`/api/organizations/${id}/`, {
        method: 'DELETE',
        body:   deleteUsers ? JSON.stringify({ delete_users: true }) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['client-users'] });
    },
  });
}

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn:  () => apiFetch<UserProfile>(`/api/users/${userId}/`),
    enabled:  !!userId,
  });
}

export interface UserUpdatePayload {
  first_name?:      string;
  last_name?:       string;
  email?:           string;
  phone?:           string;
  job_title?:       string;
  department?:      string;
  employee_id?:     string;
  reports_to?:      string;
  business_impact?: string;
  role?:            string;
  is_active?:       boolean;
  client_org_id?:   string | null;
}

export interface CreateOrgUserPayload {
  first_name:  string;
  last_name:   string;
  email:       string;
  role:        string;
  job_title:   string;
  department:  string;
  phone:       string;
}

export interface CreateOrgUserResponse extends OrgUser {
  generated_password?: string;
}

export function useCreateOrgUser(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrgUserPayload) =>
      apiFetch<CreateOrgUserResponse>(`/api/organizations/${orgId}/users/`, {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-users', orgId] });
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
    },
  });
}

export interface ResetPasswordResponse {
  detail:             string;
  generated_password: string;
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<ResetPasswordResponse>(`/api/users/${userId}/reset-password/`, {
        method: 'POST',
      }),
  });
}

// orgId passed in the payload — use when orgId isn't known at hook instantiation time
export function useCreateUserInOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: CreateOrgUserPayload }) =>
      apiFetch<OrgUser>(`/api/organizations/${orgId}/users/`, {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_, { orgId }) => {
      qc.invalidateQueries({ queryKey: ['org-users', orgId] });
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export interface ClientUser {
  id:               string;
  full_name:        string;
  email:            string;
  role:             string;
  org_id:           string | null;
  org_name:         string | null;
  deleted_org_name: string;
  job_title:        string;
  department:       string;
  is_active:        boolean;
  date_joined:      string;
}

export function useClientUsers(filter?: 'unattached' | string) {
  return useQuery({
    queryKey: ['client-users', filter ?? 'all'],
    queryFn:  () => {
      const qs = filter ? `?org=${encodeURIComponent(filter)}` : '';
      return apiFetch<ClientUser[]>(`/api/users/${qs}`);
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/users/${id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-users'] });
      qc.invalidateQueries({ queryKey: ['org-users'] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdatePayload }) =>
      apiFetch<UserProfile>(`/api/users/${id}/`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['user-profile', id] });
    },
  });
}
