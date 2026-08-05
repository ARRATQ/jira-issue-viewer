import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import type { IssueDetail, QueryIssuesResponse } from '../types/issue';
import type { QueriesResponse } from '../types/query';

// Liste des requêtes sauvegardées, pour la navigation. Peu volatile : mise en
// cache 5 min comme le branding.
export function useQueriesNav() {
  return useQuery({
    queryKey: ['queries'],
    queryFn: () => apiFetch<QueriesResponse>('/api/queries'),
    staleTime: 5 * 60_000,
  });
}

// Issues + config (colonnes de liste, onglets) d'une requête donnée.
export function useQueryIssues(queryId: string) {
  return useQuery({
    queryKey: ['query-issues', queryId],
    queryFn: () => apiFetch<QueryIssuesResponse>(`/api/queries/${queryId}/issues`),
    enabled: queryId.length > 0,
  });
}

export function useQueryIssue(queryId: string, key: string) {
  return useQuery({
    queryKey: ['query-issue', queryId, key],
    queryFn: () => apiFetch<IssueDetail>(`/api/queries/${queryId}/issues/${key}`),
    enabled: queryId.length > 0 && key.length > 0,
  });
}
