import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminQueries } from '../src/pages/admin/AdminQueries';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

const EXISTING = {
  id: 'q1',
  name: 'Export',
  jql: 'project = PROJ',
  position: 0,
  listColumns: [],
  tabs: [],
  autresVisibleToUser: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) => {
    if (path === '/api/admin/queries' && (!options || options.method === undefined)) {
      return Promise.resolve({ queries: [EXISTING] });
    }
    if (path === '/api/admin/queries' && options?.method === 'POST') {
      return Promise.resolve({ ...EXISTING, id: 'q2' });
    }
    if (options?.method === 'DELETE') {
      return Promise.resolve(undefined);
    }
    return Promise.reject(new Error(`unexpected: ${path}`));
  });
});

describe('AdminQueries', () => {
  it('lists existing queries', async () => {
    renderWithProviders(<AdminQueries />);
    expect(await screen.findByText('Export')).toBeInTheDocument();
    expect(screen.getByText('project = PROJ')).toBeInTheDocument();
  });

  it('creates a query from the form with name, jql and next position', async () => {
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Nouvelle vue' } });
    fireEvent.change(screen.getByLabelText('Requête JQL'), { target: { value: 'project = NEW' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la requête' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/admin/queries',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = vi.mocked(apiFetch).mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ name: 'Nouvelle vue', jql: 'project = NEW', position: 1 });
  });

  it('deletes a query after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/queries/q1', expect.objectContaining({ method: 'DELETE' })),
    );
  });
});
