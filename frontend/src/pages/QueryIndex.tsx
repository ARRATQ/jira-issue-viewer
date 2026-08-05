import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueriesNav } from '../hooks/useQueries';

// Route racine : redirige vers la première requête configurée (ordre
// `position`). Sert de point d'entrée par défaut maintenant que la navigation
// est pilotée par les requêtes sauvegardées plutôt que par une vue unique.
export function QueryIndex(): ReactElement {
  const { data, isLoading, isError } = useQueriesNav();

  if (isLoading) return <p>Chargement des vues…</p>;

  if (isError) {
    return (
      <p role="alert" className="issue-list__error">
        Erreur de chargement des vues.
      </p>
    );
  }

  const first = data?.queries[0];
  if (!first) {
    return <p>Aucune vue n'est configurée. Un administrateur doit en créer une.</p>;
  }

  return <Navigate to={`/queries/${first.id}`} replace />;
}
