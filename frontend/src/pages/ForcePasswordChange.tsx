import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useChangePassword } from '../hooks/useChangePassword';
import { clearMustChangePassword } from '../lib/authStore';
import { validatePasswordStrength, PASSWORD_POLICY_HINT } from '../lib/passwordPolicy';
import { ApiError } from '../lib/apiClient';
import './ForcePasswordChange.css';

// Écran imposé à la première connexion (mot de passe temporaire défini par un
// admin). Hors du Layout : ni navigation, ni accès à l'app tant que le mot de
// passe n'a pas été remplacé. Réutilise l'endpoint PATCH /api/auth/password,
// qui remet aussi le drapeau `mustChangePassword` à false côté serveur.
export function ForcePasswordChange(): ReactElement {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Déjà en règle : rien à imposer, on renvoie vers l'app.
  if (!user?.mustChangePassword) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setLocalError(null);

    if (newPassword !== confirmPassword) {
      setLocalError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (newPassword === currentPassword) {
      setLocalError('Le nouveau mot de passe doit être différent du mot de passe temporaire.');
      return;
    }
    const policyError = validatePasswordStrength(newPassword);
    if (policyError) {
      setLocalError(policyError);
      return;
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      clearMustChangePassword();
      navigate('/', { replace: true });
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : 'Erreur lors du changement de mot de passe');
    }
  }

  return (
    <div className="force-password">
      <form className="force-password__card" onSubmit={(e) => void handleSubmit(e)}>
        <h1>Changement de mot de passe requis</h1>
        <p className="force-password__intro">
          Votre mot de passe a été défini par un administrateur. Pour continuer, choisissez votre propre mot de passe.
        </p>

        <label htmlFor="fpc-current">Mot de passe temporaire</label>
        <input
          id="fpc-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />

        <label htmlFor="fpc-new">Nouveau mot de passe</label>
        <input
          id="fpc-new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        <label htmlFor="fpc-confirm">Confirmer le nouveau mot de passe</label>
        <input
          id="fpc-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <p className="force-password__hint">{PASSWORD_POLICY_HINT}</p>

        {localError && (
          <p role="alert" className="force-password__error">
            {localError}
          </p>
        )}

        <button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? 'Enregistrement…' : 'Définir mon mot de passe'}
        </button>

        <button type="button" className="force-password__logout" onClick={logout}>
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
