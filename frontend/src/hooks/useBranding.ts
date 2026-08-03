import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import type { Branding } from '../types/admin';

// Route publique (pas d'auth requise) : utilisée aussi bien sur la page de
// login que dans l'app authentifiée.
export function useBranding() {
  const query = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiFetch<Branding>('/api/branding'),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (query.data?.appName) document.title = query.data.appName;
  }, [query.data?.appName]);

  return query;
}
