import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch<{ success: boolean }>('/api/auth/password', { method: 'PATCH', body: JSON.stringify(input) }),
  });
}
