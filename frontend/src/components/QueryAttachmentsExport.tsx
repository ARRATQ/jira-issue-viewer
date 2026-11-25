import type { ReactElement } from 'react';
import { apiUrl, ApiError } from '../lib/apiClient';
import { useDeleteAttachmentExport, useStartAttachmentExport } from '../hooks/useAttachmentExports';
import type { AttachmentExport } from '../types/attachmentExport';
import './QueryAttachmentsExport.css';

interface QueryAttachmentsExportProps {
  queryId: string;
  queryName: string;
  /** Dernier export de cette requête, s'il existe. */
  job: AttachmentExport | undefined;
}

const BYTE_UNITS = ['octets', 'Ko', 'Mo', 'Go', 'To'];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${BYTE_UNITS[unit]}`;
}

function formatCount(n: number): string {
  return n.toLocaleString('fr-FR');
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Erreur lors de l'export des pièces jointes";
}

// Réservé à l'admin : export de toutes les pièces jointes des tickets de la
// requête (un dossier par ticket + manifest.csv). Le zip est construit en
// tâche de fond sur le serveur ; une fois prêt, il est téléchargé nativement
// par le navigateur (taille connue, reprise possible). Un flux unique de
// plusieurs Go était coupé par un proxy ou le navigateur.
export function QueryAttachmentsExport({ queryId, queryName, job }: QueryAttachmentsExportProps): ReactElement {
  const start = useStartAttachmentExport();
  const remove = useDeleteAttachmentExport();
  const isActive = job?.status === 'preparing' || job?.status === 'running';

  const startButton = (label: string): ReactElement => (
    <button
      type="button"
      className="query-attachments-export__button"
      aria-label={`Exporter les pièces jointes de ${queryName}`}
      title="Toutes les pièces jointes des tickets de la requête (zip + manifest.csv)"
      onClick={() => start.mutate(queryId)}
      disabled={start.isPending}
      aria-busy={start.isPending}
    >
      {start.isPending ? 'Lancement…' : label}
    </button>
  );

  return (
    <div className="query-attachments-export">
      {!job && startButton('Exporter les PJ')}

      {job?.status === 'preparing' && (
        <p className="query-attachments-export__status">Préparation : liste des pièces jointes Jira…</p>
      )}

      {job?.status === 'running' && (
        <>
          <progress
            className="query-attachments-export__progress"
            aria-label={`Progression de l’export de ${queryName}`}
            value={job.doneFiles + job.failedFiles}
            max={job.totalFiles}
            aria-valuenow={job.doneFiles + job.failedFiles}
            aria-valuemax={job.totalFiles}
          />
          <p className="query-attachments-export__status">
            {formatCount(job.doneFiles + job.failedFiles)} / {formatCount(job.totalFiles)} fichiers ·{' '}
            {formatBytes(job.processedBytes)} / {formatBytes(job.totalBytes)}
          </p>
        </>
      )}

      {isActive && (
        <button
          type="button"
          className="query-attachments-export__secondary"
          aria-label={`Annuler l’export de ${queryName}`}
          onClick={() => remove.mutate(job.id)}
          disabled={remove.isPending}
        >
          Annuler
        </button>
      )}

      {job?.status === 'done' && job.downloadUrl && (
        <>
          <a className="query-attachments-export__download" href={apiUrl(job.downloadUrl)}>
            Télécharger ({formatBytes(job.zipBytes ?? 0)})
          </a>
          <p className="query-attachments-export__status">
            {formatCount(job.doneFiles)} fichiers
            {job.failedFiles > 0 && (
              <span className="query-attachments-export__warning">
                {' '}
                · {formatCount(job.failedFiles)} fichiers en échec (voir manifest.csv)
              </span>
            )}
          </p>
          <span className="query-attachments-export__row">
            {startButton('Relancer')}
            <button
              type="button"
              className="query-attachments-export__secondary"
              onClick={() => remove.mutate(job.id)}
              disabled={remove.isPending}
            >
              Supprimer
            </button>
          </span>
        </>
      )}

      {job?.status === 'failed' && (
        <>
          <p className="query-attachments-export__error">Échec de l’export : {job.error}</p>
          {startButton('Relancer')}
        </>
      )}

      {(start.isError || remove.isError) && (
        <p className="query-attachments-export__error" role="alert">
          {errorText(start.error ?? remove.error)}
        </p>
      )}
    </div>
  );
}
