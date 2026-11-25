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

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    queryId: 'q1',
    queryName: 'Export',
    status: 'running',
    totalFiles: 8044,
    totalBytes: 5 * 1024 ** 3,
    doneFiles: 1234,
    failedFiles: 0,
    processedBytes: 1.2 * 1024 ** 3,
    zipBytes: null,
    error: null,
    createdAt: '2026-11-25T16:00:00.000Z',
    finishedAt: null,
    downloadUrl: null,
    ...overrides,
  };
}

let exportsState: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  exportsState = [];
  vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) => {
    if (path === '/api/admin/queries' && (!options || options.method === undefined)) {
      return Promise.resolve({ queries: [EXISTING] });
    }
    if (path === '/api/admin/attachments-exports' && (!options || options.method === undefined)) {
      return Promise.resolve({ exports: exportsState });
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

  function stubStart(response: Promise<unknown>) {
    const base = vi.mocked(apiFetch).getMockImplementation()!;
    vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/api/admin/queries/q1/attachments-export' && options?.method === 'POST') return response;
      if (path === '/api/admin/attachments-exports/job-1' && options?.method === 'DELETE') return Promise.resolve(undefined);
      return base(path, options);
    });
  }

  it('starts a background export of the query attachments', async () => {
    stubStart(Promise.resolve(job({ status: 'preparing' })));
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    exportsState = [job({ status: 'preparing' })];
    fireEvent.click(screen.getByRole('button', { name: 'Exporter les pièces jointes de Export' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/queries/q1/attachments-export', expect.objectContaining({ method: 'POST' })),
    );
    expect(await screen.findByText(/Préparation/)).toBeInTheDocument();
  });

  it('shows the progress of a running export and lets the admin cancel it', async () => {
    exportsState = [job()];
    stubStart(Promise.resolve(job()));
    renderWithProviders(<AdminQueries />);

    const progress = await screen.findByRole('progressbar', { name: 'Progression de l’export de Export' });
    expect(progress).toHaveAttribute('aria-valuenow', '1234');
    expect(progress).toHaveAttribute('aria-valuemax', '8044');
    expect(screen.getByText(/1\s234 \/ 8\s044 fichiers/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler l’export de Export' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/attachments-exports/job-1', expect.objectContaining({ method: 'DELETE' })),
    );
  });

  it('offers the finished zip as a native download link with its size and failed files', async () => {
    exportsState = [
      job({
        status: 'done',
        doneFiles: 8040,
        failedFiles: 4,
        zipBytes: 4.9 * 1024 ** 3,
        downloadUrl: '/api/downloads/attachments-export/tok',
      }),
    ];
    renderWithProviders(<AdminQueries />);

    const link = await screen.findByRole('link', { name: /Télécharger \(4,9 Go\)/ });
    expect(link).toHaveAttribute('href', 'https://app.example.com/api/downloads/attachments-export/tok');
    expect(screen.getByText(/4 fichiers en échec/)).toBeInTheDocument();
  });

  it('shows why an export failed', async () => {
    exportsState = [job({ status: 'failed', error: 'Jira indisponible' })];
    renderWithProviders(<AdminQueries />);
    expect(await screen.findByText(/Jira indisponible/)).toBeInTheDocument();
  });

  it('shows the server error when the export cannot start', async () => {
    stubStart(Promise.reject(new ApiError('Un export est déjà en cours')));
    renderWithProviders(<AdminQueries />);
    await screen.findByText('Export');

    fireEvent.click(screen.getByRole('button', { name: 'Exporter les pièces jointes de Export' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Un export est déjà en cours');
  });
});
