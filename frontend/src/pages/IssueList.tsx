import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryIssues } from '../hooks/useQueries';
import { ApiError } from '../lib/apiClient';
import { IssueDetailDrawer } from '../components/IssueDetailDrawer';
import type { IssueSummary } from '../types/issue';
import './IssueList.css';

// Valeurs distinctes d'une colonne dynamique (indexée par nom de champ dans
// `extraFields`), pour peupler le sélecteur de filtre correspondant.
function distinctColumnValues(issues: IssueSummary[], fieldName: string): string[] {
  const values = new Set<string>();
  for (const issue of issues) {
    const value = issue.extraFields[fieldName];
    if (typeof value === 'string' && value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function distinctStatuses(issues: IssueSummary[]): string[] {
  const values = new Set<string>();
  for (const issue of issues) {
    if (issue.status) values.add(issue.status);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function IssueList(): ReactElement {
  const { queryId = '' } = useParams();
  const { data, isLoading, isError, error } = useQueryIssues(queryId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  // Filtres des colonnes dynamiques, indexés par nom de champ.
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const issues = data?.issues ?? [];
  const listColumns = data?.listColumns ?? [];

  const statusOptions = useMemo(() => distinctStatuses(issues), [issues]);
  const columnOptions = useMemo(
    () => listColumns.map((col) => ({ fieldName: col.fieldName, options: distinctColumnValues(issues, col.fieldName) })),
    [issues, listColumns],
  );

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (statusFilter && issue.status !== statusFilter) return false;
        for (const [fieldName, value] of Object.entries(columnFilters)) {
          if (value && issue.extraFields[fieldName] !== value) return false;
        }
        return true;
      }),
    [issues, statusFilter, columnFilters],
  );

  function closeDrawer(): void {
    setSelectedKey(null);
    setIsDrawerExpanded(false);
  }

  if (isLoading) return <p>Chargement des issues…</p>;

  if (isError) {
    return (
      <p role="alert" className="issue-list__error">
        {error instanceof ApiError ? error.message : 'Erreur de chargement des issues'}
      </p>
    );
  }

  if (!data || data.issues.length === 0) {
    return <p>Aucune issue ne correspond à la requête JQL configurée.</p>;
  }

  return (
    <div className="issue-list">
      <p className="issue-list__jql">
        <code>{data.jql}</code>
      </p>

      <div className="issue-list__filters">
        <label>
          Statut
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {columnOptions.map((col) => (
          <label key={col.fieldName}>
            {col.fieldName}
            <select
              value={columnFilters[col.fieldName] ?? ''}
              onChange={(e) =>
                setColumnFilters((prev) => ({ ...prev, [col.fieldName]: e.target.value }))
              }
            >
              <option value="">Tous</option>
              {col.options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {filteredIssues.length === 0 ? (
        <p>Aucune issue ne correspond à ces filtres.</p>
      ) : (
        <div className="table-scroll">
          <table className="issue-list__table">
            <thead>
              <tr>
                <th>Clé</th>
                <th>Résumé</th>
                <th>Statut</th>
                <th>Type</th>
                {listColumns.map((col) => (
                  <th key={col.fieldName}>{col.fieldName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((issue) => (
                <tr key={issue.key} onClick={() => setSelectedKey(issue.key)} className="issue-list__row">
                  <td>
                    <button type="button" className="issue-list__key-button">
                      {issue.key}
                    </button>
                  </td>
                  <td>{issue.summary}</td>
                  <td>{issue.status ?? '—'}</td>
                  <td>{issue.issueType ?? '—'}</td>
                  {listColumns.map((col) => (
                    <td key={col.fieldName}>{issue.extraFields[col.fieldName] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IssueDetailDrawer
        queryId={queryId}
        tabs={data.tabs}
        autresVisibleToUser={data.autresVisibleToUser}
        issueKey={selectedKey}
        isExpanded={isDrawerExpanded}
        onClose={closeDrawer}
        onToggleExpand={() => setIsDrawerExpanded((v) => !v)}
      />
    </div>
  );
}
