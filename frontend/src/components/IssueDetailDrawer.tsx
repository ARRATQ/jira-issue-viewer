import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Drawer } from './Drawer';
import { AttachmentItem } from './AttachmentItem';
import { useIssue } from '../hooks/useIssues';
import { ApiError } from '../lib/apiClient';
import { groupIssueFields } from '../lib/issueFieldGroups';
import { formatFieldValue } from '../lib/formatFieldValue';
import './IssueDetailDrawer.css';

interface IssueDetailDrawerProps {
  issueKey: string | null;
  isExpanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

export function IssueDetailDrawer({ issueKey, isExpanded, onClose, onToggleExpand }: IssueDetailDrawerProps): ReactElement {
  const { data, isLoading, isError, error } = useIssue(issueKey ?? '');
  const groups = useMemo(() => groupIssueFields(data?.fields ?? []), [data?.fields]);
  const [activeTab, setActiveTab] = useState(groups[0]?.id ?? '');

  const currentTabId = groups.some((g) => g.id === activeTab) ? activeTab : (groups[0]?.id ?? '');
  const currentGroup = groups.find((g) => g.id === currentTabId);

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
            {data.attachments.length === 0 ? (
              <p>Aucune pièce jointe.</p>
            ) : (
              <ul>
                {data.attachments.map((attachment) => (
                  <AttachmentItem key={attachment.id} issueKey={data.key} attachment={attachment} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
