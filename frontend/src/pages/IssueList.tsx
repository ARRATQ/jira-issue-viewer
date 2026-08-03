import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useIssues } from '../hooks/useIssues';
import { ApiError } from '../lib/apiClient';
import './IssueList.css';

export function IssueList(): ReactElement {
  const { data, isLoading, isError, error } = useIssues();

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
            <tr key={issue.key}>
              <td>
                <Link to={`/issues/${issue.key}`}>{issue.key}</Link>
              </td>
              <td>{issue.summary}</td>
              <td>{issue.status ?? '—'}</td>
              <td>{issue.issueType ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
