import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useAdminConfig, useUpdateConfig } from '../../hooks/useAdmin';
import { ApiError } from '../../lib/apiClient';
import './AdminConfig.css';

export function AdminConfig(): ReactElement {
  const { data, isLoading, isError, error } = useAdminConfig();
  const updateConfig = useUpdateConfig();

  const [jiraUrl, setJiraUrl] = useState('');
  const [jql, setJql] = useState('');
  const [pat, setPat] = useState('');
  const [tlsRejectUnauthorized, setTlsRejectUnauthorized] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setJiraUrl(data.jiraUrl ?? '');
    setJql(data.jql);
    setTlsRejectUnauthorized(data.tlsRejectUnauthorized);
  }, [data]);

  if (isLoading) return <p>Chargement de la configuration…</p>;
  if (isError) {
    return (
      <p role="alert" className="admin-config__error">
        {error instanceof ApiError ? error.message : 'Erreur de chargement de la configuration'}
      </p>
    );
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSuccessMessage(null);
    await updateConfig.mutateAsync({
      jiraUrl,
      jql,
      tlsRejectUnauthorized,
      ...(pat ? { pat } : {}),
    });
    setPat('');
    setSuccessMessage('Configuration enregistrée.');
  }

  return (
    <form className="admin-config" onSubmit={(e) => void handleSubmit(e)}>
      <h1>Configuration Jira</h1>

      <label htmlFor="jiraUrl">URL Jira Data Center</label>
      <input
        id="jiraUrl"
        value={jiraUrl}
        onChange={(e) => setJiraUrl(e.target.value)}
        placeholder="https://jira.example.com/jira"
      />

      <label htmlFor="jql">Requête JQL globale</label>
      <textarea id="jql" value={jql} onChange={(e) => setJql(e.target.value)} rows={3} />

      <label htmlFor="pat">Personal Access Token</label>
      <input
        id="pat"
        type="password"
        autoComplete="new-password"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        placeholder={data?.patConfigured ? '•••••••• (laisser vide pour conserver)' : 'Aucun PAT configuré'}
      />

      <label className="admin-config__checkbox">
        <input
          type="checkbox"
          checked={tlsRejectUnauthorized}
          onChange={(e) => setTlsRejectUnauthorized(e.target.checked)}
        />
        Vérifier le certificat TLS de Jira (désactiver uniquement pour un certificat interne/auto-signé)
      </label>

      {updateConfig.isError && (
        <p role="alert" className="admin-config__error">
          {updateConfig.error instanceof ApiError ? updateConfig.error.message : "Erreur lors de l'enregistrement"}
        </p>
      )}
      {successMessage && <p className="admin-config__success">{successMessage}</p>}

      <button type="submit" disabled={updateConfig.isPending}>
        {updateConfig.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
