import type { ReactElement } from 'react';
import type { DateRange } from '../lib/issueListView';
import { EMPTY_FILTER, NOT_EMPTY_FILTER } from '../lib/issueTable';

// Type de filtre d'une colonne dynamique : période pour les dates, saisie
// « contient » au-delà de TEXT_SEARCH_THRESHOLD valeurs, liste sinon.
export interface ColumnFilterOption {
  fieldName: string;
  isDate: boolean;
  isText: boolean;
  options: string[];
}

interface IssueFiltersProps {
  statusOptions: string[];
  status: string;
  columns: ColumnFilterOption[];
  columnFilters: Record<string, string>;
  dateFilters: Record<string, DateRange>;
  canReset: boolean;
  onStatusChange: (value: string) => void;
  onColumnFilterChange: (fieldName: string, value: string) => void;
  onDateFilterChange: (fieldName: string, bound: keyof DateRange, value: string) => void;
  onReset: () => void;
}

function isPresenceFilter(value: string): boolean {
  return value === EMPTY_FILTER || value === NOT_EMPTY_FILTER;
}

export function IssueFilters({
  statusOptions,
  status,
  columns,
  columnFilters,
  dateFilters,
  canReset,
  onStatusChange,
  onColumnFilterChange,
  onDateFilterChange,
  onReset,
}: IssueFiltersProps): ReactElement {
  return (
    <div className="issue-list__filters">
      <label>
        Statut
        <select value={status} onChange={(e) => onStatusChange(e.target.value)}>
          <option value="">Tous</option>
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {columns.map((col) => {
        const value = columnFilters[col.fieldName] ?? '';
        if (col.isDate) {
          return (
            <fieldset key={col.fieldName} className="issue-list__date-range">
              <legend>{col.fieldName}</legend>
              <label>
                du
                <input
                  type="date"
                  aria-label={`${col.fieldName} du`}
                  value={dateFilters[col.fieldName]?.from ?? ''}
                  max={dateFilters[col.fieldName]?.to || undefined}
                  onChange={(e) => onDateFilterChange(col.fieldName, 'from', e.target.value)}
                />
              </label>
              <label>
                au
                <input
                  type="date"
                  aria-label={`${col.fieldName} au`}
                  value={dateFilters[col.fieldName]?.to ?? ''}
                  min={dateFilters[col.fieldName]?.from || undefined}
                  onChange={(e) => onDateFilterChange(col.fieldName, 'to', e.target.value)}
                />
              </label>
            </fieldset>
          );
        }
        if (col.isText) {
          // Le mode « vide / non vide » remplace la saisie : on désactive le
          // champ plutôt que de mélanger les deux critères.
          const mode = isPresenceFilter(value) ? value : '';
          return (
            <fieldset key={col.fieldName} className="issue-list__text-filter">
              <legend>{col.fieldName}</legend>
              <div className="issue-list__text-filter-row">
                <select
                  aria-label={`${col.fieldName} : mode`}
                  value={mode}
                  onChange={(e) => onColumnFilterChange(col.fieldName, e.target.value)}
                >
                  <option value="">contient</option>
                  <option value={EMPTY_FILTER}>vide</option>
                  <option value={NOT_EMPTY_FILTER}>non vide</option>
                </select>
                <input
                  type="search"
                  aria-label={col.fieldName}
                  placeholder="Contient…"
                  disabled={mode !== ''}
                  value={mode ? '' : value}
                  onChange={(e) => onColumnFilterChange(col.fieldName, e.target.value)}
                />
              </div>
            </fieldset>
          );
        }
        return (
          <label key={col.fieldName}>
            {col.fieldName}
            <select value={value} onChange={(e) => onColumnFilterChange(col.fieldName, e.target.value)}>
              <option value="">Tous</option>
              <option value={EMPTY_FILTER}>— Vide —</option>
              <option value={NOT_EMPTY_FILTER}>— Non vide —</option>
              {col.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <button type="button" className="issue-list__reset" onClick={onReset} disabled={!canReset}>
        Réinitialiser les filtres
      </button>
    </div>
  );
}
