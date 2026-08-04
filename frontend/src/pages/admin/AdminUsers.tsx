import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useAdminUsers, useCreateUser, useUpdateUser } from '../../hooks/useAdmin';
import { ApiError } from '../../lib/apiClient';
import type { AdminUser } from '../../types/admin';
import './AdminUsers.css';

export function AdminUsers(): ReactElement {
  const { data, isLoading, isError, error } = useAdminUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminUser['role']>('USER');

  if (isLoading) return <p>Chargement des comptes…</p>;
  if (isError) {
    return (
      <p role="alert" className="admin-users__error">
        {error instanceof ApiError ? error.message : 'Erreur de chargement des comptes'}
      </p>
    );
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    await createUser.mutateAsync({ email, name, password, role });
    setEmail('');
    setName('');
    setPassword('');
    setRole('USER');
  }

  return (
    <div className="admin-users">
      <h1>Comptes</h1>

      <div className="table-scroll">
        <table className="admin-users__table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.name}</td>
                <td>
                  <select
                    aria-label={`Rôle de ${user.email}`}
                    value={user.role}
                    onChange={(e) => updateUser.mutate({ id: user.id, role: e.target.value as AdminUser['role'] })}
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>{user.active ? 'Actif' : 'Désactivé'}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => updateUser.mutate({ id: user.id, active: !user.active })}
                    disabled={updateUser.isPending}
                  >
                    {user.active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Créer un compte</h2>
      <form className="admin-users__form" onSubmit={(e) => void handleCreate(e)}>
        <label htmlFor="new-email">Email</label>
        <input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="new-name">Nom</label>
        <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="new-password">Mot de passe</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label htmlFor="new-role">Rôle</label>
        <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as AdminUser['role'])}>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>

        {createUser.isError && (
          <p role="alert" className="admin-users__error">
            {createUser.error instanceof ApiError ? createUser.error.message : 'Erreur lors de la création du compte'}
          </p>
        )}

        <button type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? 'Création…' : 'Créer le compte'}
        </button>
      </form>
    </div>
  );
}
