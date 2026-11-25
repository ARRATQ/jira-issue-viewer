import { useState } from 'react';
import type { ReactElement } from 'react';
import { apiFetch, apiUrl, ApiError } from '../lib/apiClient';
import './QueryAttachmentsExportButton.css';

interface QueryAttachmentsExportButtonProps {
  queryId: string;
  queryName: string;
}

interface ExportPreparation {
  downloadUrl: string;
  issueCount: number;
  fileCount: number;
  totalBytes: number;
}

export function attachmentsExportPath(queryId: string): string {
  return `/api/admin/queries/${encodeURIComponent(queryId)}/attachments-export`;
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

// Réservé à l'admin : exporte toutes les pièces jointes des tickets de la
// requête (un dossier par ticket + manifest.csv). Le serveur prépare l'export
// et renvoie une URL à usage unique ; le navigateur la télécharge ensuite
// nativement, directement sur disque. Un fetch() en mémoire échouait sur les
// archives de plusieurs Go.
export function QueryAttachmentsExportButton({ queryId, queryName }: QueryAttachmentsExportButtonProps): ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const prep = await apiFetch<ExportPreparation>(attachmentsExportPath(queryId), { method: 'POST' });
      const summary =
        `${prep.fileCount.toLocaleString('fr-FR')} fichiers (${prep.issueCount.toLocaleString('fr-FR')} tickets), ` +
        `environ ${formatBytes(prep.totalBytes)}.`;
      if (!window.confirm(`Exporter les pièces jointes de « ${queryName} » ?\n\n${summary}\n\nLe téléchargement démarre dans le navigateur.`)) {
        return;
      }
      const link = document.createElement('a');
      link.href = apiUrl(prep.downloadUrl);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Erreur lors de l'export des pièces jointes");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <span className="query-attachments-export">
      <button
        type="button"
        className="query-attachments-export__button"
        aria-label={`Exporter les pièces jointes de ${queryName}`}
        title="Toutes les pièces jointes des tickets de la requête (zip + manifest.csv)"
        onClick={() => void handleExport()}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? 'Préparation…' : 'Exporter les PJ'}
      </button>
      {errorMessage && (
        <span className="query-attachments-export__error" role="alert">
          {errorMessage}
        </span>
      )}
    </span>
  );
}
