import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useChangePassword } from '../hooks/useChangePassword';
import { validatePasswordStrength, PASSWORD_POLICY_HINT } from '../lib/passwordPolicy';
import { ApiError } from '../lib/apiClient';
import './AccountSettings.css';

export function AccountSettings(): ReactElement {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (newPassword !== confirmPassword) {
      setLocalError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    const policyError = validatePasswordStrength(newPassword);
    if (policyError) {
      setLocalError(policyError);
      return;
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Mot de passe mis à jour.');
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : "Erreur lors du changement de mot de passe");
    }
  }

  return (
    <form className="account-settings" onSubmit={(e) => void handleSubmit(e)}>
      <h1>Mon compte</h1>
      <h2>Changer de mot de passe</h2>

      <label htmlFor="currentPassword">Mot de passe actuel</label>
      <input
        id="currentPassword"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
      />

      <label htmlFor="newPassword">Nouveau mot de passe</label>
      <input
        id="newPassword"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />

      <label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</label>
      <input
        id="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />

      <p className="account-settings__hint">{PASSWORD_POLICY_HINT}</p>

      {localError && (
        <p role="alert" className="account-settings__error">
          {localError}
        </p>
      )}
      {successMessage && <p className="account-settings__success">{successMessage}</p>}

      <button type="submit" disabled={changePassword.isPending}>
        {changePassword.isPending ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
      </button>
    </form>
  );
}
