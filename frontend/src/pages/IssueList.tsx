import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useIssues } from '../hooks/useIssues';
import { ApiError } from '../lib/apiClient';
import { IssueDetailDrawer } from '../components/IssueDetailDrawer';
import type { IssueSummary } from '../types/issue';
import './IssueList.css';

function distinctValues(issues: IssueSummary[], key: 'status' | 'profilExport' | 'offreExport'): string[] {
  const values = new Set<string>();
  for (const issue of issues) {
    const value = issue[key];
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function IssueList(): ReactElement {
  const { data, isLoading, isError, error } = useIssues();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [profilFilter, setProfilFilter] = useState('');
  const [offreFilter, setOffreFilter] = useState('');

  const issues = data?.issues ?? [];

  const statusOptions = useMemo(() => distinctValues(issues, 'status'), [issues]);
  const profilOptions = useMemo(() => distinctValues(issues, 'profilExport'), [issues]);
  const offreOptions = useMemo(() => distinctValues(issues, 'offreExport'), [issues]);

  const filteredIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          (!statusFilter || issue.status === statusFilter) &&
          (!profilFilter || issue.profilExport === profilFilter) &&
          (!offreFilter || issue.offreExport === offreFilter),
      ),
    [issues, statusFilter, profilFilter, offreFilter],
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
        <label>
          Profil Export
          <select value={profilFilter} onChange={(e) => setProfilFilter(e.target.value)}>
            <option value="">Tous</option>
            {profilOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Offre Export
          <select value={offreFilter} onChange={(e) => setOffreFilter(e.target.value)}>
            <option value="">Tous</option>
            {offreOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredIssues.length === 0 ? (
        <p>Aucune issue ne correspond à ces filtres.</p>
      ) : (
        <table className="issue-list__table">
          <thead>
            <tr>
              <th>Clé</th>
              <th>Résumé</th>
              <th>Statut</th>
              <th>Type</th>
              <th>Profil Export</th>
              <th>Offre Export</th>
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
                <td>{issue.profilExport ?? '—'}</td>
                <td>{issue.offreExport ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <IssueDetailDrawer
        issueKey={selectedKey}
        isExpanded={isDrawerExpanded}
        onClose={closeDrawer}
        onToggleExpand={() => setIsDrawerExpanded((v) => !v)}
      />
    </div>
  );
}
