import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminUsers } from '../src/pages/admin/AdminUsers';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

const USER = {
  id: 'u1',
  email: 'jane@example.com',
  name: 'Jane',
  role: 'USER' as const,
  active: true,
  mustChangePassword: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) => {
    if (path === '/api/admin/users' && (!options || options.method === undefined)) {
      return Promise.resolve({ users: [USER] });
    }
    if (path === '/api/admin/users' && options?.method === 'POST') {
      return Promise.resolve({ ...USER, id: 'u2' });
    }
    if (options?.method === 'PATCH') {
      return Promise.resolve({ ...USER, mustChangePassword: true });
    }
    return Promise.reject(new Error(`unexpected: ${path}`));
  });
});

describe('AdminUsers — forced password change', () => {
  it('creates a user with mustChangePassword=true by default', async () => {
    renderWithProviders(<AdminUsers />);
    await screen.findByText('jane@example.com');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'P@ssw0rd123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({ method: 'POST' })),
    );
    const call = vi.mocked(apiFetch).mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({ email: 'new@example.com', mustChangePassword: true });
  });

  it('lets the admin uncheck the requirement at creation', async () => {
    renderWithProviders(<AdminUsers />);
    await screen.findByText('jane@example.com');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'P@ssw0rd123' } });
    fireEvent.click(screen.getByLabelText(/Exiger un changement de mot de passe à la première connexion/));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const call = vi.mocked(apiFetch).mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(JSON.parse(call[1]!.body as string).mustChangePassword).toBe(false);
  });

  it('requires a password change for an existing user via the row checkbox', async () => {
    renderWithProviders(<AdminUsers />);
    await screen.findByText('jane@example.com');

    fireEvent.click(screen.getByRole('checkbox', { name: /Exiger un changement de mot de passe pour jane@example.com/ }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/users/u1', expect.objectContaining({ method: 'PATCH' })),
    );
    const call = vi.mocked(apiFetch).mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ mustChangePassword: true });
  });
});

describe('AdminUsers — edit panel', () => {
  async function openEditPanel() {
    renderWithProviders(<AdminUsers />);
    await screen.findByText('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier jane@example.com' }));
    return screen.getByRole('dialog', { name: /Modifier le compte/ });
  }

  function patchBodies(): unknown[] {
    return vi
      .mocked(apiFetch)
      .mock.calls.filter((c) => c[1]?.method === 'PATCH')
      .map((c) => JSON.parse(c[1]!.body as string));
  }

  it('pre-fills the profile form and sends the edited name, email and role', async () => {
    await openEditPanel();

    expect(screen.getByLabelText('Nom du compte')).toHaveValue('Jane');
    expect(screen.getByLabelText('Email du compte')).toHaveValue('jane@example.com');

    fireEvent.change(screen.getByLabelText('Nom du compte'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email du compte'), { target: { value: 'jane.doe@example.com' } });
    fireEvent.change(screen.getByLabelText('Rôle du compte'), { target: { value: 'ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(patchBodies()).toHaveLength(1));
    expect(patchBodies()[0]).toEqual({ name: 'Jane Doe', email: 'jane.doe@example.com', role: 'ADMIN' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the server error when the email is already used', async () => {
    const { ApiError } = await import('../src/lib/apiClient');
    vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') return Promise.reject(new ApiError('Cette adresse email est déjà utilisée'));
      return Promise.resolve({ users: [USER] });
    });
    await openEditPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette adresse email est déjà utilisée');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('resets the password with a temporary password', async () => {
    await openEditPanel();

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe temporaire'), { target: { value: 'T3mp!Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() => expect(patchBodies()).toEqual([{ password: 'T3mp!Passw0rd' }]));
    expect(await screen.findByText(/Mot de passe réinitialisé/)).toBeInTheDocument();
  });

  it('blocks a weak temporary password before calling the API', async () => {
    await openEditPanel();

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe temporaire'), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Le mot de passe doit contenir/);
    expect(patchBodies()).toHaveLength(0);
  });

  it('closes the panel without saving on Escape', async () => {
    await openEditPanel();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(patchBodies()).toHaveLength(0);
  });
});
