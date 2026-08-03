import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useIssue } from '../hooks/useIssues';
import { ApiError } from '../lib/apiClient';
import { AttachmentItem } from '../components/AttachmentItem';
import { formatFieldValue } from '../lib/formatFieldValue';
import './IssueDetail.css';

export function IssueDetail(): ReactElement {
  const { key = '' } = useParams<{ key: string }>();
  const { data, isLoading, isError, error } = useIssue(key);

  if (isLoading) return <p>Chargement de {key}…</p>;

  if (isError) {
    return (
      <p role="alert" className="issue-detail__error">
        {error instanceof ApiError ? error.message : `Erreur de chargement de ${key}`}
      </p>
    );
  }

  if (!data) return <p>Issue introuvable.</p>;

  return (
    <div className="issue-detail">
      <Link to="/" className="issue-detail__back">
        ← Retour à la liste
      </Link>

      <h1>
        {data.key} — {data.summary}
      </h1>
      <p className="issue-detail__meta">
        <span>Statut : {data.status ?? '—'}</span>
        <span>Type : {data.issueType ?? '—'}</span>
      </p>

      <section>
        <h2>Champs renseignés</h2>
        {data.fields.length === 0 ? (
          <p>Aucun champ renseigné.</p>
        ) : (
          <dl className="issue-detail__fields">
            {data.fields.map((field) => (
              <div key={field.id} className="issue-detail__field">
                <dt>{field.name}</dt>
                <dd>{formatFieldValue(field.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <h2>Pièces jointes</h2>
        {data.attachments.length === 0 ? (
          <p>Aucune pièce jointe.</p>
        ) : (
          <ul className="issue-detail__attachments">
            {data.attachments.map((attachment) => (
              <AttachmentItem key={attachment.id} issueKey={data.key} attachment={attachment} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
