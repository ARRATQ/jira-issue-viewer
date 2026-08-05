import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import type { FieldRef, JiraFieldMeta, QueryTab, SavedQuery } from '../types/query';

// Liste complète des requêtes (avec tabs/listColumns) — côté admin.
export function useAdminQueries() {
  return useQuery({
    queryKey: ['admin', 'queries'],
    queryFn: () => apiFetch<{ queries: SavedQuery[] }>('/api/admin/queries'),
  });
}

// Catalogue Jira pour alimenter les sélecteurs de champs. Peu volatile.
export function useJiraFields() {
  return useQuery({
    queryKey: ['admin', 'jira-fields'],
    queryFn: () => apiFetch<{ fields: JiraFieldMeta[] }>('/api/admin/jira-fields'),
    staleTime: 5 * 60_000,
  });
}

export interface CreateQueryInput {
  name: string;
  jql: string;
  position?: number;
  listColumns?: FieldRef[];
  tabs?: QueryTab[];
  autresVisibleToUser?: boolean;
}

// Invalide à la fois la liste admin et la navigation utilisateur (les deux
// dépendent de l'ensemble des requêtes sauvegardées).
function invalidateQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'queries'] });
  void queryClient.invalidateQueries({ queryKey: ['queries'] });
}

export function useCreateQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQueryInput) =>
      apiFetch<SavedQuery>('/api/admin/queries', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateQueries(queryClient),
  });
}

export interface UpdateQueryInput {
  id: string;
  name?: string;
  jql?: string;
  position?: number;
  listColumns?: FieldRef[];
  tabs?: QueryTab[];
  autresVisibleToUser?: boolean;
}

export function useUpdateQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateQueryInput) =>
      apiFetch<SavedQuery>(`/api/admin/queries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (updated) => {
      invalidateQueries(queryClient);
      // Le détail d'une issue est regroupé selon les onglets de la requête :
      // invalider son cache pour refléter une config modifiée.
      void queryClient.invalidateQueries({ queryKey: ['query-issues', updated.id] });
    },
  });
}

export function useDeleteQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/queries/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateQueries(queryClient),
  });
}
