import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useUpdateUser } from '../../hooks/useAdmin';
import { ApiError } from '../../lib/apiClient';
import { PASSWORD_POLICY_HINT, validatePasswordStrength } from '../../lib/passwordPolicy';
import type { AdminUser } from '../../types/admin';
import './UserEditPanel.css';

interface UserEditPanelProps {
  user: AdminUser;
  onClose: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

// Panneau modal d'édition d'un compte : profil (nom, email, rôle) et
// réinitialisation du mot de passe. Les deux formulaires sont indépendants
// (états d'envoi et d'erreur séparés) pour qu'une réinitialisation n'emporte
// pas de modification de profil non voulue, et inversement.
export function UserEditPanel({ user, onClose }: UserEditPanelProps): ReactElement {
  const updateProfile = useUpdateUser();
  const resetPassword = useUpdateUser();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<AdminUser['role']>(user.role);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleProfileSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      await updateProfile.mutateAsync({ id: user.id, name, email, role });
      onClose();
    } catch {
      // L'erreur est affichée via updateProfile.error.
    }
  }

  async function handlePasswordSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const policyError = validatePasswordStrength(password);
    setPasswordError(policyError);
    if (policyError) return;
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      setPassword('');
    } catch {
      // L'erreur est affichée via resetPassword.error.
    }
  }

  const resetError =
    passwordError ?? (resetPassword.isError ? errorMessage(resetPassword.error, 'Erreur lors de la réinitialisation') : null);

  return (
    <div className="user-edit__overlay" onClick={onClose}>
      <div
        className="user-edit__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="user-edit__header">
          <div>
            <h2 id="user-edit-title">Modifier le compte</h2>
            <p className="user-edit__subtitle">{user.email}</p>
          </div>
          <button type="button" className="user-edit__close" onClick={onClose} aria-label="Fermer" title="Fermer">
            ✕
          </button>
        </header>

        <form className="user-edit__section" onSubmit={(e) => void handleProfileSubmit(e)}>
          <h3>Informations</h3>
          <label htmlFor="edit-name">Nom du compte</label>
          <input id="edit-name" ref={firstFieldRef} value={name} onChange={(e) => setName(e.target.value)} required />

          <label htmlFor="edit-email">Email du compte</label>
          <input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <label htmlFor="edit-role">Rôle du compte</label>
          <select id="edit-role" value={role} onChange={(e) => setRole(e.target.value as AdminUser['role'])}>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          {updateProfile.isError && (
            <p role="alert" className="user-edit__error">
              {errorMessage(updateProfile.error, 'Erreur lors de la mise à jour du compte')}
            </p>
          )}

          <div className="user-edit__actions">
            <button type="button" className="user-edit__secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="user-edit__primary" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>

        <form className="user-edit__section user-edit__section--danger" onSubmit={(e) => void handlePasswordSubmit(e)}>
          <h3>Réinitialiser le mot de passe</h3>
          <p className="user-edit__hint">
            Communiquez ce mot de passe temporaire à l’utilisateur : il devra le remplacer à sa prochaine connexion.
          </p>
          <label htmlFor="edit-password">Nouveau mot de passe temporaire</label>
          <input
            id="edit-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="edit-password-hint"
            required
          />
          <p id="edit-password-hint" className="user-edit__hint">
            {PASSWORD_POLICY_HINT}
          </p>

          {resetError && (
            <p role="alert" className="user-edit__error">
              {resetError}
            </p>
          )}
          {resetPassword.isSuccess && !resetError && (
            <p role="status" className="user-edit__success">
              Mot de passe réinitialisé. Un changement sera exigé à la prochaine connexion.
            </p>
          )}

          <div className="user-edit__actions">
            <button type="submit" className="user-edit__danger" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
