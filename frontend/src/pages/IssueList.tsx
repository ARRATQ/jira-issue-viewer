import { useState } from 'react';
import type { ReactElement } from 'react';
import { useIssues } from '../hooks/useIssues';
import { ApiError } from '../lib/apiClient';
import { IssueDetailDrawer } from '../components/IssueDetailDrawer';
import './IssueList.css';

export function IssueList(): ReactElement {
  const { data, isLoading, isError, error } = useIssues();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

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
      <table className="issue-list__table">
        <thead>
          <tr>
            <th>Clé</th>
            <th>Résumé</th>
            <th>Statut</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {data.issues.map((issue) => (
            <tr key={issue.key} onClick={() => setSelectedKey(issue.key)} className="issue-list__row">
              <td>
                <button type="button" className="issue-list__key-button">
                  {issue.key}
                </button>
              </td>
              <td>{issue.summary}</td>
              <td>{issue.status ?? '—'}</td>
              <td>{issue.issueType ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <IssueDetailDrawer
        issueKey={selectedKey}
        isExpanded={isDrawerExpanded}
        onClose={closeDrawer}
        onToggleExpand={() => setIsDrawerExpanded((v) => !v)}
      />
    </div>
  );
}
