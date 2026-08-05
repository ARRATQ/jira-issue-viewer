import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAdminQueries, useUpdateQuery } from '../../hooks/useAdminQueries';
import { FieldPicker } from '../../components/FieldPicker';
import { TabEditor } from '../../components/TabEditor';
import { ApiError } from '../../lib/apiClient';
import type { FieldRef, QueryTab, SavedQuery } from '../../types/query';
import './AdminQueryEditor.css';

function newTab(position: number): QueryTab {
  return { id: crypto.randomUUID(), label: 'Nouvel onglet', position, visibleToUser: true, fields: [] };
}

// Déplace un élément d'un tableau (immutable) de `from` vers `from + direction`.
function moveItem<T>(items: T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function AdminQueryEditor(): ReactElement {
  const { queryId = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAdminQueries();
  const updateQuery = useUpdateQuery();

  const [draft, setDraft] = useState<SavedQuery | null>(null);

  const source = data?.queries.find((q) => q.id === queryId);

  // Initialise (ou réinitialise sur changement d'id) la copie éditable dès que
  // la requête ciblée est disponible dans le cache admin.
  useEffect(() => {
    if (source) setDraft(source);
  }, [queryId, Boolean(source)]);

  if (isLoading || (!draft && source)) return <p>Chargement de la requête…</p>;

  if (!source || !draft) {
    return (
      <div className="admin-query-editor">
        <p role="alert" className="admin-query-editor__error">
          Requête introuvable.
        </p>
        <Link to="/admin/queries">Retour aux requêtes</Link>
      </div>
    );
  }

  function patch(changes: Partial<SavedQuery>): void {
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));
  }

  function setListColumns(listColumns: FieldRef[]): void {
    patch({ listColumns });
  }

  function updateTab(index: number, tab: QueryTab): void {
    patch({ tabs: draft!.tabs.map((t, i) => (i === index ? tab : t)) });
  }

  function moveTab(index: number, direction: -1 | 1): void {
    patch({ tabs: moveItem(draft!.tabs, index, direction) });
  }

  function removeTab(index: number): void {
    patch({ tabs: draft!.tabs.filter((_, i) => i !== index) });
  }

  function addTab(): void {
    patch({ tabs: [...draft!.tabs, newTab(draft!.tabs.length)] });
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const current = draft!;
    // Les positions des onglets suivent l'ordre d'affichage au moment de
    // l'enregistrement, quels que soient les déplacements effectués.
    const tabs = current.tabs.map((tab, index) => ({ ...tab, position: index }));
    await updateQuery.mutateAsync({
      id: current.id,
      name: current.name,
      jql: current.jql,
      listColumns: current.listColumns,
      tabs,
      autresVisibleToUser: current.autresVisibleToUser,
    });
    navigate('/admin/queries');
  }

  return (
    <form className="admin-query-editor" onSubmit={(e) => void handleSubmit(e)}>
      <div className="admin-query-editor__breadcrumb">
        <Link to="/admin/queries">← Requêtes</Link>
      </div>
      <h1>Éditer « {source.name} »</h1>

      <label className="admin-query-editor__field">
        <span>Nom</span>
        <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} required />
      </label>

      <label className="admin-query-editor__field">
        <span>Requête JQL</span>
        <textarea value={draft.jql} onChange={(e) => patch({ jql: e.target.value })} rows={2} required />
      </label>

      <section className="admin-query-editor__section">
        <h2>Colonnes de la liste</h2>
        <p className="admin-query-editor__hint">
          En plus des colonnes fixes Clé / Résumé / Statut / Type.
        </p>
        <FieldPicker label="Colonnes supplémentaires" value={draft.listColumns} onChange={setListColumns} />
      </section>

      <section className="admin-query-editor__section">
        <h2>Onglets de la fiche</h2>
        {draft.tabs.length === 0 && <p>Aucun onglet personnalisé. Les champs iront tous dans « Autres ».</p>}
        <div className="admin-query-editor__tabs">
          {draft.tabs.map((tab, index) => (
            <TabEditor
              key={tab.id}
              tab={tab}
              index={index}
              total={draft.tabs.length}
              onChange={(t) => updateTab(index, t)}
              onMove={(direction) => moveTab(index, direction)}
              onRemove={() => removeTab(index)}
            />
          ))}
        </div>
        <button type="button" className="admin-query-editor__add" onClick={addTab}>
          + Ajouter un onglet
        </button>

        <label className="admin-query-editor__toggle">
          <input
            type="checkbox"
            checked={draft.autresVisibleToUser}
            onChange={(e) => patch({ autresVisibleToUser: e.target.checked })}
          />
          Onglet « Autres » visible pour le rôle USER
        </label>
      </section>

      {updateQuery.isError && (
        <p role="alert" className="admin-query-editor__error">
          {updateQuery.error instanceof ApiError ? updateQuery.error.message : "Erreur lors de l'enregistrement"}
        </p>
      )}

      <div className="admin-query-editor__actions">
        <button type="submit" disabled={updateQuery.isPending}>
          {updateQuery.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <Link to="/admin/queries">Annuler</Link>
      </div>
    </form>
  );
}
