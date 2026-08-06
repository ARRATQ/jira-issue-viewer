import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ForcePasswordChange } from '../src/pages/ForcePasswordChange';
import { setAuth } from '../src/lib/authStore';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/force-password-change']}>
        <Routes>
          <Route path="/force-password-change" element={<ForcePasswordChange />} />
          <Route path="/" element={<div>PAGE ACCUEIL</div>} />
          <Route path="/login" element={<div>PAGE LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function authWith(mustChangePassword: boolean) {
  setAuth({
    accessToken: 't',
    refreshToken: 'r',
    user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER', mustChangePassword },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth(null);
});

describe('ForcePasswordChange', () => {
  it('redirects to the app when no change is required', () => {
    authWith(false);
    renderScreen();
    expect(screen.getByText('PAGE ACCUEIL')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    renderScreen();
    expect(screen.getByText('PAGE LOGIN')).toBeInTheDocument();
  });

  it('shows an error and does not call the API when confirmation does not match', async () => {
    authWith(true);
    renderScreen();

    fireEvent.change(screen.getByLabelText('Mot de passe temporaire'), { target: { value: 'T3mp!Pass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'N3w!Password' } });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'Mismatch!1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Définir mon mot de passe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/confirmation/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('changes the password, clears the flag, and enters the app', async () => {
    authWith(true);
    vi.mocked(apiFetch).mockResolvedValue({ success: true });
    renderScreen();

    expect(screen.getByRole('heading', { name: 'Changement de mot de passe requis' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mot de passe temporaire'), { target: { value: 'T3mp!Pass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'N3w!Password' } });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'N3w!Password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Définir mon mot de passe' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/auth/password',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    expect(await screen.findByText('PAGE ACCUEIL')).toBeInTheDocument();
  });
});
