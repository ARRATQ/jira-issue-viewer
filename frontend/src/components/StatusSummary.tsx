import type { ReactElement } from 'react';
import type { IssueSummary, StatusCategory } from '../types/issue';
import { StatusPill } from './StatusPill';
import './StatusSummary.css';

interface StatusCount {
  status: string;
  category: StatusCategory | null;
  count: number;
}

// Ordre du workflow Jira : À faire, En cours, Terminé, puis statuts sans catégorie.
const CATEGORY_RANK: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };

function countByStatus(issues: IssueSummary[], activeStatus: string): StatusCount[] {
  const counts = new Map<string, StatusCount>();
  for (const issue of issues) {
    if (!issue.status) continue;
    const entry = counts.get(issue.status) ?? { status: issue.status, category: issue.statusCategory ?? null, count: 0 };
    counts.set(issue.status, { ...entry, count: entry.count + 1 });
  }
  // Le statut filtré reste affiché même à zéro, pour pouvoir le désactiver.
  if (activeStatus && !counts.has(activeStatus)) {
    counts.set(activeStatus, { status: activeStatus, category: null, count: 0 });
  }
  const rank = (c: StatusCount) => CATEGORY_RANK[c.category ?? ''] ?? 3;
  return [...counts.values()].sort((a, b) => rank(a) - rank(b) || a.status.localeCompare(b.status));
}

interface StatusSummaryProps {
  // Issues filtrées par tout sauf le statut : les compteurs suivent la
  // recherche et les autres filtres.
  issues: IssueSummary[];
  activeStatus: string;
  onSelect: (status: string) => void;
}

export function StatusSummary({ issues, activeStatus, onSelect }: StatusSummaryProps): ReactElement {
  const counts = countByStatus(issues, activeStatus);
  return (
    <div className="status-summary" role="group" aria-label="Répartition des issues">
      {counts.map(({ status, category, count }) => {
        const isActive = status === activeStatus;
        return (
          <button
            key={status}
            type="button"
            className="status-summary__item"
            aria-pressed={isActive}
            aria-label={`${status} (${count})`}
            onClick={() => onSelect(isActive ? '' : status)}
          >
            <StatusPill label={status} category={category} />
            <span className="status-summary__count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
