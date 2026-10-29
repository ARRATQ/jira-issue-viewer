import type { IssueSummary } from '../types/issue';
import { isoDatePart } from './dateValues';

// Colonnes fixes du tableau ; les autres colonnes sont identifiées par leur
// nom de champ Jira (clé de `extraFields`).
export type FixedColumn = 'key' | 'summary' | 'status' | 'issueType';

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

// Au-delà de ce nombre de valeurs distinctes, une liste déroulante devient
// inutilisable (Raison sociale, Nom…) : le filtre passe en saisie "contient".
export const TEXT_SEARCH_THRESHOLD = 15;

const FIXED_COLUMNS: readonly string[] = ['key', 'summary', 'status', 'issueType'];
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function matchesText(value: string | null | undefined, query: string): boolean {
  const needle = normalizeText(query.trim());
  if (!needle) return true;
  return value ? normalizeText(value).includes(needle) : false;
}

function columnValue(issue: IssueSummary, column: string): string | null | undefined {
  if (FIXED_COLUMNS.includes(column)) return issue[column as FixedColumn];
  return issue.extraFields[column];
}

// Tri stable sur une copie : les valeurs vides restent en fin de liste quel
// que soit le sens, et les dates se comparent sur leur partie AAAA-MM-JJ.
export function sortIssues(
  issues: IssueSummary[],
  sort: SortState | null,
  dateColumns: ReadonlySet<string>,
): IssueSummary[] {
  if (!sort) return issues;
  const isDate = dateColumns.has(sort.column);
  const sign = sort.direction === 'asc' ? 1 : -1;
  const valueOf = (issue: IssueSummary): string | null => {
    const raw = columnValue(issue, sort.column);
    if (!raw) return null;
    return isDate ? (isoDatePart(raw) ?? raw) : raw;
  };
  return [...issues].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    return sign * collator.compare(va, vb);
  });
}

// Clic sur un en-tête : croissant, puis décroissant, puis retour à l'ordre Jira.
export function nextSort(current: SortState | null, column: string): SortState | null {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}
