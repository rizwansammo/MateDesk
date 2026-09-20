import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface EmailSettings {
  // Auth method
  auth_method:             'basic' | 'oauth2' | 'matemail';
  // IMAP
  imap_host:               string;
  imap_port:               number;
  imap_username:           string;
  imap_password:           string;
  imap_password_set:       boolean;
  imap_use_ssl:            boolean;
  imap_folder:             string;
  imap_enabled:            boolean;
  // SMTP
  smtp_host:               string;
  smtp_port:               number;
  smtp_username:           string;
  smtp_password:           string;
  smtp_password_set:       boolean;
  smtp_use_tls:            boolean;
  smtp_from_name:          string;
  smtp_from_email:         string;
  smtp_enabled:            boolean;
  // OAuth2
  oauth_provider:          string;
  oauth_client_id:         string;
  oauth_client_secret:     string;
  oauth_client_secret_set: boolean;
  oauth_tenant_id:         string;
  // MateMail Connected App
  matemail_connected:       boolean;
  matemail_tenant_id:       string;
  matemail_mailbox_id:      string;
  matemail_mailbox_email:   string;
  matemail_mailbox_name:    string;
  matemail_permissions:     { key: string; label: string }[];
  matemail_connected_at:    string | null;
  // Status
  last_polled_at:          string | null;
  emails_processed:        number;
  last_error:              string;
}

export function useEmailSettings() {
  return useQuery({
    queryKey: ['emailSettings'],
    queryFn:  () => apiFetch<EmailSettings>('/api/email-settings/'),
  });
}

export function useSaveEmailSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailSettings>) =>
      apiFetch<EmailSettings>('/api/email-settings/', {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emailSettings'] }),
  });
}

export function useTestImap() {
  return useMutation({
    mutationFn: (data: {
      imap_host: string; imap_port: number; imap_username: string;
      imap_password: string; imap_use_ssl: boolean;
    }) =>
      apiFetch<{ success: boolean; message: string }>('/api/email-settings/test-imap/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
  });
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: (data: {
      smtp_host: string; smtp_port: number; smtp_username: string;
      smtp_password: string; smtp_use_tls: boolean;
    }) =>
      apiFetch<{ success: boolean; message: string }>('/api/email-settings/test-smtp/', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
  });
}


export type MateMailConnectStart = {
  status?: string;
  tenant_id: string;
  mailbox_id?: string;
  mailbox_email?: string;
  mailbox_name?: string;
  permissions?: { key: string; label: string }[];
  authorization_url: string;
  poll_token: string;
  expires_at?: string;
};

export type MateMailConnectComplete =
  | EmailSettings
  | { status: 'pending' | 'rejected' | 'expired' };

export function useStartMateMailConnection() {
  return useMutation({
    mutationFn: (data: { tenant_id: string; integration_secret: string }) =>
      apiFetch<MateMailConnectStart>('/api/email-settings/matemail/start/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}

export function useCompleteMateMailConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tenant_id: string; poll_token: string }) =>
      apiFetch<MateMailConnectComplete>('/api/email-settings/matemail/complete/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: data => {
      if ('auth_method' in data) {
        qc.invalidateQueries({ queryKey: ['emailSettings'] });
      }
    },
  });
}

export function useDisconnectMateMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<EmailSettings>('/api/email-settings/matemail/disconnect/', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emailSettings'] }),
  });
}
