import { formatDisplayDate } from './dateValues';
import type { IssueListView } from './issueListView';
import { EMPTY_FILTER, NOT_EMPTY_FILTER } from './issueTable';

export type ActiveFilterKind = 'search' | 'status' | 'column' | 'date';

export interface ActiveFilter {
  id: string;
  kind: ActiveFilterKind;
  // Nom du champ pour les filtres de colonne et de date.
  field?: string;
  label: string;
}

function columnLabel(field: string, value: string, isText: boolean): string {
  if (value === EMPTY_FILTER) return `${field} : vide`;
  if (value === NOT_EMPTY_FILTER) return `${field} : non vide`;
  return isText ? `${field} contient « ${value} »` : `${field} : ${value}`;
}

function periodLabel(field: string, from: string, to: string): string {
  if (from && to) return `${field} : du ${formatDisplayDate(from)} au ${formatDisplayDate(to)}`;
  return from ? `${field} : à partir du ${formatDisplayDate(from)}` : `${field} : jusqu'au ${formatDisplayDate(to)}`;
}

// Étiquettes des filtres actifs, dans l'ordre d'affichage des contrôles. Comme
// pour le filtrage, seuls les filtres des colonnes affichées comptent.
export function describeActiveFilters(
  view: IssueListView,
  visibleColumns: readonly string[],
  textColumns: ReadonlySet<string>,
  dateColumns: ReadonlySet<string>,
): ActiveFilter[] {
  const filters: ActiveFilter[] = [];
  const search = view.search.trim();
  if (search) filters.push({ id: 'search', kind: 'search', label: `Recherche : « ${search} »` });
  if (view.status) filters.push({ id: 'status', kind: 'status', label: `Statut : ${view.status}` });
  for (const field of visibleColumns) {
    if (dateColumns.has(field)) {
      const range = view.dateFilters[field];
      if (range && (range.from || range.to)) {
        filters.push({ id: `date:${field}`, kind: 'date', field, label: periodLabel(field, range.from, range.to) });
      }
      continue;
    }
    const value = view.columnFilters[field];
    if (value) {
      filters.push({ id: `column:${field}`, kind: 'column', field, label: columnLabel(field, value, textColumns.has(field)) });
    }
  }
  return filters;
}
