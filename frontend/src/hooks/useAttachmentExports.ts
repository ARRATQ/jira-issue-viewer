import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import type { AttachmentExport } from '../types/attachmentExport';

const EXPORTS_KEY = ['admin', 'attachment-exports'] as const;
// Rafraîchissement de la progression tant qu'un export tourne.
const POLL_INTERVAL_MS = 2_000;

function isActive(job: AttachmentExport): boolean {
  return job.status === 'preparing' || job.status === 'running';
}

export function useAttachmentExports() {
  return useQuery({
    queryKey: EXPORTS_KEY,
    queryFn: () => apiFetch<{ exports: AttachmentExport[] }>('/api/admin/attachments-exports'),
    refetchInterval: (query) => (query.state.data?.exports.some(isActive) ? POLL_INTERVAL_MS : false),
  });
}

export function useStartAttachmentExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (queryId: string) =>
      apiFetch<AttachmentExport>(`/api/admin/queries/${encodeURIComponent(queryId)}/attachments-export`, {
        method: 'POST',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY }),
  });
}

// Annule un export en cours ou supprime un export terminé.
export function useDeleteAttachmentExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (exportId: string) =>
      apiFetch<void>(`/api/admin/attachments-exports/${encodeURIComponent(exportId)}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY }),
  });
}
