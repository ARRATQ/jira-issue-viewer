import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAdminQueries, useCreateQuery, useDeleteQuery, useUpdateQuery } from '../../hooks/useAdminQueries';
import { ApiError } from '../../lib/apiClient';
import type { SavedQuery } from '../../types/query';
import './AdminQueries.css';

export function AdminQueries(): ReactElement {
  const { data, isLoading, isError, error } = useAdminQueries();
  const createQuery = useCreateQuery();
  const updateQuery = useUpdateQuery();
  const deleteQuery = useDeleteQuery();

  const [name, setName] = useState('');
  const [jql, setJql] = useState('');

  if (isLoading) return <p>Chargement des requêtes…</p>;
  if (isError) {
    return (
      <p role="alert" className="admin-queries__error">
        {error instanceof ApiError ? error.message : 'Erreur de chargement des requêtes'}
      </p>
    );
  }

  const queries = data?.queries ?? [];

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    await createQuery.mutateAsync({ name, jql, position: queries.length });
    setName('');
    setJql('');
  }

  // Réordonnancement : échange les positions de deux requêtes adjacentes.
  function move(index: number, direction: -1 | 1): void {
    const current = queries[index];
    const neighbour = queries[index + direction];
    if (!current || !neighbour) return;
    updateQuery.mutate({ id: current.id, position: neighbour.position });
    updateQuery.mutate({ id: neighbour.id, position: current.position });
  }

  function handleDelete(query: SavedQuery): void {
    if (!window.confirm(`Supprimer la requête « ${query.name} » ?`)) return;
    deleteQuery.mutate(query.id);
  }

  return (
    <div className="admin-queries">
      <h1>Requêtes</h1>

      {queries.length === 0 ? (
        <p>Aucune requête configurée pour l&rsquo;instant.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-queries__table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>JQL</th>
                <th>Ordre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {queries.map((query, index) => (
                <tr key={query.id}>
                  <td>{query.name}</td>
                  <td>
                    <code className="admin-queries__jql">{query.jql || '—'}</code>
                  </td>
                  <td className="admin-queries__order">
                    <button
                      type="button"
                      aria-label={`Monter ${query.name}`}
                      disabled={index === 0 || updateQuery.isPending}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Descendre ${query.name}`}
                      disabled={index === queries.length - 1 || updateQuery.isPending}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                  </td>
                  <td className="admin-queries__actions">
                    <Link to={query.id}>Éditer</Link>
                    <button
                      type="button"
                      className="admin-queries__delete"
                      onClick={() => handleDelete(query)}
                      disabled={deleteQuery.isPending}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Créer une requête</h2>
      <form className="admin-queries__form" onSubmit={(e) => void handleCreate(e)}>
        <label htmlFor="new-query-name">Nom</label>
        <input id="new-query-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="new-query-jql">Requête JQL</label>
        <textarea id="new-query-jql" value={jql} onChange={(e) => setJql(e.target.value)} rows={2} required />

        {createQuery.isError && (
          <p role="alert" className="admin-queries__error">
            {createQuery.error instanceof ApiError ? createQuery.error.message : 'Erreur lors de la création'}
          </p>
        )}

        <button type="submit" disabled={createQuery.isPending}>
          {createQuery.isPending ? 'Création…' : 'Créer la requête'}
        </button>
      </form>
    </div>
  );
}
