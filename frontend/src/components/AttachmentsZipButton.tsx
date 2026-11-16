import { useState } from 'react';
import type { ReactElement } from 'react';
import { apiFetchBlob, ApiError } from '../lib/apiClient';

interface AttachmentsZipButtonProps {
  queryId: string;
  issueKey: string;
  count: number;
}

export function attachmentsZipPath(queryId: string, issueKey: string): string {
  return `/api/queries/${encodeURIComponent(queryId)}/issues/${encodeURIComponent(issueKey)}/attachments.zip`;
}

// Télécharge en une fois toutes les pièces jointes visibles du ticket, sous
// forme d'une archive zip construite par le backend.
export function AttachmentsZipButton({ queryId, issueKey, count }: AttachmentsZipButtonProps): ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDownload(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const blob = await apiFetchBlob(attachmentsZipPath(queryId, issueKey));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${issueKey}-pieces-jointes.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Erreur lors de la création de l'archive");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="attachments-zip">
      <button
        type="button"
        className="attachments-zip__button"
        onClick={() => void handleDownload()}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? 'Préparation du zip…' : `Tout télécharger (${count}) .zip`}
      </button>
      {errorMessage && (
        <p className="attachments-zip__error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
