import type { ReactElement } from 'react';
import type { ActiveFilter } from '../lib/activeFilters';
import './ActiveFilterChips.css';

interface ActiveFilterChipsProps {
  filters: ActiveFilter[];
  onRemove: (filter: ActiveFilter) => void;
}

// Filtres actifs en étiquettes : on voit d'un coup d'œil ce qui réduit la
// liste, et on retire un filtre sans retrouver son contrôle.
export function ActiveFilterChips({ filters, onRemove }: ActiveFilterChipsProps): ReactElement | null {
  if (filters.length === 0) return null;
  return (
    <ul className="filter-chips" aria-label="Filtres actifs">
      {filters.map((filter) => (
        <li key={filter.id} className="filter-chips__chip">
          {filter.label}
          <button
            type="button"
            className="filter-chips__remove"
            aria-label={`Retirer le filtre ${filter.label}`}
            onClick={() => onRemove(filter)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
