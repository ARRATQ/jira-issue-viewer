import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminQueries } from '../src/pages/admin/AdminQueries';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  apiUrl: (path: string) => `https://app.example.com${path}`,
  ApiError: class ApiError extends Error {},
}));

import { apiFetch, ApiError } from '../src/lib/apiClient';

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

  function stubPrepare(response: Promise<unknown>) {
    const base = vi.mocked(apiFetch).getMockImplementation()!;
    vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) =>
      path === '/api/admin/queries/q1/attachments-export' && options?.method === 'POST' ? response : base(path, options),
    );
  }

  it('prepares the export, shows its volume, then hands the one-time URL to a native browser download', async () => {
    stubPrepare(
      Promise.resolve({
        downloadUrl: '/api/downloads/attachments-export/tok',
        issueCount: 120,
        fileCount: 3412,
        totalBytes: 4.2 * 1024 ** 3,
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    fireEvent.click(screen.getByRole('button', { name: 'Exporter les pièces jointes de Export' }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(confirm.mock.calls[0]![0]).toMatch(/3\u202f?412 fichiers.*120 tickets.*4,2 Go/s);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.href).toBe('https://app.example.com/api/downloads/attachments-export/tok');
    click.mockRestore();
  });

  it('does not start the download when the admin cancels', async () => {
    stubPrepare(
      Promise.resolve({ downloadUrl: '/api/downloads/attachments-export/tok', issueCount: 1, fileCount: 1, totalBytes: 10 }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    fireEvent.click(screen.getByRole('button', { name: 'Exporter les pièces jointes de Export' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter les pièces jointes de Export' })).toBeEnabled());
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('shows the server error when the export is refused', async () => {
    stubPrepare(Promise.reject(new ApiError('La requête renvoie 5000 tickets')));
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    fireEvent.click(screen.getByRole('button', { name: 'Exporter les pièces jointes de Export' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La requête renvoie 5000 tickets');
  });
});
