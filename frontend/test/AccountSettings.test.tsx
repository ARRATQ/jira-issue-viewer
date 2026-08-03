import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSettings } from '../src/pages/AccountSettings';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountSettings', () => {
  it('rejects a new password that does not meet the strength policy without calling the API', async () => {
    renderWithProviders();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'Origin4l!Pass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('rejects a confirmation that does not match the new password', async () => {
    renderWithProviders();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'Origin4l!Pass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'N3w!Password' } });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'Different!1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }));

    expect(await screen.findByText(/ne correspond pas/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('submits a valid, matching password change and shows a success message', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });
    renderWithProviders();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'Origin4l!Pass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'N3w!Password' } });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'N3w!Password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/auth/password', expect.objectContaining({ method: 'PATCH' })));
    expect(await screen.findByText('Mot de passe mis à jour.')).toBeInTheDocument();
  });
});
