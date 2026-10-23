import { JiraClient } from '../lib/jira';
import type { JiraConfig, JiraSearchResult } from '../lib/jira';

// Cache court des recherches Jira : une liste de plusieurs milliers d'issues
// coûte des dizaines d'appels, et plusieurs utilisateurs consultent souvent la
// même requête. Partager le résultat entre utilisateurs est sans risque : Jira
// est toujours interrogé avec le même PAT, donc les mêmes droits.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 50;

interface CacheEntry {
  expiresAt: number;
  result: Promise<JiraSearchResult>;
}

const cache = new Map<string, CacheEntry>();

// On met en cache la promesse, pas le résultat : deux appels simultanés pour
// la même recherche ne déclenchent qu'une seule série d'appels Jira.
export function searchIssuesCached(
  config: JiraConfig,
  jql: string,
  extraFieldNames: string[],
): Promise<JiraSearchResult> {
  const key = `${config.baseUrl}|${jql}|${extraFieldNames.join(',')}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.result;

  const result = new JiraClient(config).searchIssues(jql, extraFieldNames);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
  // Une erreur Jira ne doit pas être resservie pendant toute la durée du cache.
  result.catch(() => {
    if (cache.get(key)?.result === result) cache.delete(key);
  });
  // Map conserve l'ordre d'insertion : on évince la plus ancienne entrée.
  if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return result;
}

export function clearIssueSearchCache(): void {
  cache.clear();
}
