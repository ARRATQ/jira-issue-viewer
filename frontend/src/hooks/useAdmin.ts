import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import type { AdminUser, AuditLogsResponse, Branding, PublicConfig } from '../types/admin';

export function useAdminConfig() {
  return useQuery({
    queryKey: ['admin', 'config'],
    queryFn: () => apiFetch<PublicConfig>('/api/admin/config'),
  });
}

export interface UpdateConfigInput {
  jiraUrl?: string;
  jql?: string;
  pat?: string;
  tlsRejectUnauthorized?: boolean;
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConfigInput) =>
      apiFetch<PublicConfig>('/api/admin/config', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'config'], data);
      // La liste des issues dépend du JQL global : elle doit être rafraîchie.
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export interface UpdateBrandingInput {
  appName?: string;
  logoDataUrl?: string | null;
  confidentialityNotice?: string;
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBrandingInput) =>
      apiFetch<Branding>('/api/admin/branding', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['branding'], data);
    },
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<{ users: AdminUser[] }>('/api/admin/users'),
  });
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: 'ADMIN' | 'USER';
  mustChangePassword?: boolean;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<AdminUser>('/api/admin/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  role?: 'ADMIN' | 'USER';
  active?: boolean;
  password?: string;
  mustChangePassword?: boolean;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateUserInput) =>
      apiFetch<AdminUser>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export interface AuditLogsFilters {
  page: number;
  action?: string;
}

export function useAuditLogs(filters: AuditLogsFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  if (filters.action) params.set('action', filters.action);

  return useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: () => apiFetch<AuditLogsResponse>(`/api/admin/audit-logs?${params.toString()}`),
  });
}
