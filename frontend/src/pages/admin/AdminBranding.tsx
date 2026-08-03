import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { useBranding } from '../../hooks/useBranding';
import { useUpdateBranding } from '../../hooks/useAdmin';
import { ApiError } from '../../lib/apiClient';
import './AdminBranding.css';

const MAX_LOGO_BYTES = 512 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Erreur de lecture du fichier'));
    reader.readAsDataURL(file);
  });
}

export function AdminBranding(): ReactElement {
  const { data, isLoading, isError, error } = useBranding();
  const updateBranding = useUpdateBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [appName, setAppName] = useState('');
  const [confidentialityNotice, setConfidentialityNotice] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  // undefined = pas de changement de logo ; null = suppression ; string = nouveau logo
  const [pendingLogo, setPendingLogo] = useState<string | null | undefined>(undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setAppName(data.appName);
    setConfidentialityNotice(data.confidentialityNotice);
    setLogoPreview(data.logoDataUrl);
  }, [data]);

  if (isLoading) return <p>Chargement…</p>;
  if (isError) {
    return (
      <p role="alert" className="admin-branding__error">
        {error instanceof ApiError ? error.message : 'Erreur de chargement'}
      </p>
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    setLocalError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setLocalError('Le logo dépasse la taille maximale autorisée (500 Ko).');
      event.target.value = '';
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setLogoPreview(dataUrl);
    setPendingLogo(dataUrl);
  }

  function handleRemoveLogo(): void {
    setLogoPreview(null);
    setPendingLogo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSuccessMessage(null);
    setLocalError(null);
    try {
      await updateBranding.mutateAsync({
        appName,
        confidentialityNotice,
        ...(pendingLogo !== undefined ? { logoDataUrl: pendingLogo } : {}),
      });
      setPendingLogo(undefined);
      setSuccessMessage('Personnalisation enregistrée.');
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    }
  }

  return (
    <form className="admin-branding" onSubmit={(e) => void handleSubmit(e)}>
      <h1>Personnalisation</h1>

      <label htmlFor="appName">Nom de l&rsquo;application</label>
      <input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} required />

      <label htmlFor="logo">Logo</label>
      {logoPreview && (
        <div className="admin-branding__logo-preview">
          <img src={logoPreview} alt="Logo actuel" />
          <button type="button" onClick={handleRemoveLogo}>
            Supprimer le logo
          </button>
        </div>
      )}
      <input
        id="logo"
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(e) => void handleFileChange(e)}
      />
      <p className="admin-branding__hint">PNG, JPEG, WebP ou SVG, 500 Ko maximum.</p>

      <label htmlFor="confidentialityNotice">Mention de confidentialité (affichée sur la page de connexion)</label>
      <textarea
        id="confidentialityNotice"
        value={confidentialityNotice}
        onChange={(e) => setConfidentialityNotice(e.target.value)}
        rows={4}
        required
      />

      {localError && (
        <p role="alert" className="admin-branding__error">
          {localError}
        </p>
      )}
      {successMessage && <p className="admin-branding__success">{successMessage}</p>}

      <button type="submit" disabled={updateBranding.isPending}>
        {updateBranding.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
