import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import type { IssueDetail, IssuesResponse } from '../types/issue';

export function useIssues() {
  return useQuery({
    queryKey: ['issues'],
    queryFn: () => apiFetch<IssuesResponse>('/api/issues'),
  });
}

export function useIssue(key: string) {
  return useQuery({
    queryKey: ['issue', key],
    queryFn: () => apiFetch<IssueDetail>(`/api/issues/${key}`),
    enabled: key.length > 0,
  });
}
