import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { apiFetchBlob, ApiError } from '../lib/apiClient';
import type { AttachmentMeta } from '../types/issue';
import './AttachmentItem.css';

interface AttachmentItemProps {
  queryId: string;
  issueKey: string;
  attachment: AttachmentMeta;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function AttachmentItem({ queryId, issueKey, attachment }: AttachmentItemProps): ReactElement {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isImage = attachment.mimeType.startsWith('image/');
  const isPdf = attachment.mimeType === 'application/pdf';
  const canPreview = isImage || isPdf;
  const path = `/api/queries/${queryId}/issues/${issueKey}/attachments/${attachment.id}`;

  // Révoque l'URL d'objet précédente à chaque changement, et au démontage
  // (évite de fuir la mémoire des blobs chargés).
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleTogglePreview(): Promise<void> {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const blob = await apiFetchBlob(path);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Erreur de chargement de l'aperçu");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownload(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const blob = await apiFetchBlob(path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Erreur de téléchargement');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <li className="attachment-item">
      <div className="attachment-item__row">
        <div className="attachment-item__meta">
          <span className="attachment-item__filename">{attachment.filename}</span>
          <span className="attachment-item__size">{formatSize(attachment.size)}</span>
        </div>
        <div className="attachment-item__actions">
          {canPreview && (
            <button type="button" onClick={() => void handleTogglePreview()} disabled={isLoading}>
              {previewUrl ? "Masquer l'aperçu" : 'Aperçu'}
            </button>
          )}
          <button type="button" onClick={() => void handleDownload()} disabled={isLoading}>
            Télécharger
          </button>
        </div>
      </div>

      {errorMessage && (
        <p className="attachment-item__error" role="alert">
          {errorMessage}
        </p>
      )}

      {previewUrl && isImage && (
        <img
          src={previewUrl}
          alt={attachment.filename}
          loading="lazy"
          className="attachment-item__preview-image"
        />
      )}
      {previewUrl && isPdf && (
        <iframe src={previewUrl} title={attachment.filename} className="attachment-item__preview-pdf" />
      )}
    </li>
  );
}
