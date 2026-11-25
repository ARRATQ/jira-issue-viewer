import { useState } from 'react';
import type { ReactElement } from 'react';
import { apiFetchBlob, ApiError } from '../lib/apiClient';
import { csvFileName } from '../lib/csvExport';
import './QueryAttachmentsExportButton.css';

interface QueryAttachmentsExportButtonProps {
  queryId: string;
  queryName: string;
}

export function attachmentsExportPath(queryId: string): string {
  return `/api/admin/queries/${encodeURIComponent(queryId)}/attachments-export.zip`;
}

// Même nom que celui proposé par le serveur (pieces-jointes-<requête>-<date>.zip).
export function attachmentsExportFileName(queryName: string, date: Date = new Date()): string {
  // csvFileName fournit déjà "<slug>-<AAAA-MM-JJ>.csv" ; un nom vide donne
  // le slug par défaut "issues", remplacé ici par "export".
  const hasSlug = /[a-z0-9]/i.test(queryName.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const base = csvFileName(hasSlug ? queryName : 'export', date).replace(/\.csv$/, '');
  return `pieces-jointes-${base}.zip`;
}

// Réservé à l'admin : télécharge toutes les pièces jointes des tickets de la
// requête, un dossier par ticket, avec un manifest.csv (clé ↔ fichier).
export function QueryAttachmentsExportButton({ queryId, queryName }: QueryAttachmentsExportButtonProps): ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const blob = await apiFetchBlob(attachmentsExportPath(queryId));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachmentsExportFileName(queryName);
      link.click();
      URL.revokeObjectURL(url);
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
        {isLoading ? 'Export en cours…' : 'Exporter les PJ'}
      </button>
      {errorMessage && (
        <span className="query-attachments-export__error" role="alert">
          {errorMessage}
        </span>
      )}
    </span>
  );
}
