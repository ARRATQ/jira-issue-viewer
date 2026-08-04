import { useState } from 'react';
import type { ReactElement } from 'react';
import { useAuditLogs } from '../../hooks/useAdmin';
import { ApiError } from '../../lib/apiClient';
import './AdminAuditLogs.css';

const ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'VIEW_LIST',
  'VIEW_ISSUE',
  'DOWNLOAD_ATTACHMENT',
  'UPDATE_CONFIG',
  'CREATE_USER',
  'UPDATE_USER',
  'DEACTIVATE_USER',
];

export function AdminAuditLogs(): ReactElement {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, isLoading, isError, error } = useAuditLogs({ page, action: action || undefined });

  if (isLoading) return <p>Chargement du journal d&rsquo;audit…</p>;
  if (isError) {
    return (
      <p role="alert" className="admin-audit-logs__error">
        {error instanceof ApiError ? error.message : "Erreur de chargement du journal d'audit"}
      </p>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="admin-audit-logs">
      <h1>Journal d&rsquo;audit</h1>

      <label htmlFor="action-filter">Filtrer par action</label>
      <select
        id="action-filter"
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPage(1);
        }}
      >
        <option value="">Toutes</option>
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <div className="table-scroll">
        <table className="admin-audit-logs__table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Entité</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                <td>{log.user?.email ?? log.userId}</td>
                <td>{log.action}</td>
                <td>
                  {log.entityType ? `${log.entityType}${log.entityKey ? ` · ${log.entityKey}` : ''}` : '—'}
                </td>
                <td>{log.ipAddress ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-audit-logs__pagination">
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Précédent
        </button>
        <span>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
