import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Drawer } from './Drawer';
import { AttachmentItem } from './AttachmentItem';
import { useAuth } from '../hooks/useAuth';
import { useQueryIssue } from '../hooks/useQueries';
import { ApiError } from '../lib/apiClient';
import { groupIssueFields } from '../lib/issueFieldGroups';
import { formatFieldValue } from '../lib/formatFieldValue';
import type { QueryTab } from '../types/query';
import './IssueDetailDrawer.css';

interface IssueDetailDrawerProps {
  queryId: string;
  tabs: QueryTab[];
  autresVisibleToUser: boolean;
  issueKey: string | null;
  isExpanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

export function IssueDetailDrawer({
  queryId,
  tabs,
  autresVisibleToUser,
  issueKey,
  isExpanded,
  onClose,
  onToggleExpand,
}: IssueDetailDrawerProps): ReactElement {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useQueryIssue(queryId, issueKey ?? '');
  const groups = useMemo(() => {
    const allGroups = groupIssueFields(data?.fields ?? [], tabs, autresVisibleToUser);
    if (user?.role === 'ADMIN') return allGroups;
    // La visibilité par rôle est désormais pilotée par la config de la requête :
    // chaque onglet (et "Autres") porte son propre `visibleToUser`.
    return allGroups.filter((g) => g.visibleToUser);
  }, [data?.fields, tabs, autresVisibleToUser, user?.role]);
  const [activeTab, setActiveTab] = useState(groups[0]?.id ?? '');

  const currentTabId = groups.some((g) => g.id === activeTab) ? activeTab : (groups[0]?.id ?? '');
  const currentGroup = groups.find((g) => g.id === currentTabId);

  // USER ne voit que les pièces jointes déposées par le rapporteur du
  // ticket ; ADMIN garde la visibilité complète.
  const visibleAttachments = useMemo(() => {
    if (!data) return [];
    if (user?.role === 'ADMIN') return data.attachments;
    return data.attachments.filter((a) => a.authorId !== null && a.authorId === data.reporterId);
  }, [data, user?.role]);

  return (
    <Drawer
      isOpen={issueKey !== null}
      isExpanded={isExpanded}
      onClose={onClose}
      onToggleExpand={onToggleExpand}
      title={issueKey ?? ''}
    >
      {isLoading && <p>Chargement de {issueKey}…</p>}

      {isError && (
        <p role="alert" className="issue-detail-drawer__error">
          {error instanceof ApiError ? error.message : `Erreur de chargement de ${issueKey}`}
        </p>
      )}

      {data && (
        <div className="issue-detail-drawer">
          <header className="issue-detail-drawer__header">
            <h2>{data.summary}</h2>
            <p className="issue-detail-drawer__meta">
              <span>Statut : {data.status ?? '—'}</span>
              <span>Type : {data.issueType ?? '—'}</span>
            </p>
          </header>

          <nav className="issue-detail-drawer__tabs" aria-label="Sections de la fiche ticket">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={group.id === currentTabId ? 'is-active' : ''}
                onClick={() => setActiveTab(group.id)}
                disabled={group.fields.length === 0}
              >
                {group.label}
              </button>
            ))}
          </nav>

          <div className="issue-detail-drawer__fields">
            {!currentGroup || currentGroup.fields.length === 0 ? (
              <p className="issue-detail-drawer__empty">Aucun champ renseigné dans cette section.</p>
            ) : (
              currentGroup.fields.map((field) => (
                <div key={field.id} className="field-row">
                  <span className="field-row__label">{field.name}</span>
                  <span className="field-row__value">{formatFieldValue(field.value)}</span>
                </div>
              ))
            )}
          </div>

          <section className="issue-detail-drawer__attachments">
            <h3>Pièces jointes</h3>
            {visibleAttachments.length === 0 ? (
              <p>Aucune pièce jointe.</p>
            ) : (
              <ul>
                {visibleAttachments.map((attachment) => (
                  <AttachmentItem key={attachment.id} queryId={queryId} issueKey={data.key} attachment={attachment} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
