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
