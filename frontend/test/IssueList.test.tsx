import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IssueList } from '../src/pages/IssueList';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

// Monte IssueList derrière la route paramétrée dont il lit `queryId`.
function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/queries/q1']}>
        <Routes>
          <Route path="/queries/:queryId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BASE_LIST = {
  queryId: 'q1',
  queryName: 'Export',
  jql: 'project = PROJ',
  listColumns: [],
  tabs: [{ id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] }],
  autresVisibleToUser: false,
  issues: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IssueList', () => {
  it('shows a loading state, then the issue table', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ...BASE_LIST,
      issues: [{ key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task', extraFields: {} }],
    });

    renderWithProviders(<IssueList />);

    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
    expect(await screen.findByText('PROJ-1')).toBeInTheDocument();
    expect(screen.getByText('Ticket un')).toBeInTheDocument();
    expect(screen.getByText('project = PROJ')).toBeInTheDocument();
  });

  it('shows an empty state when there are no issues', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...BASE_LIST, issues: [] });
    renderWithProviders(<IssueList />);
    expect(await screen.findByText(/Aucune issue/i)).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    renderWithProviders(<IssueList />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('opens the detail drawer with its fields when clicking an issue key', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/queries/q1/issues') {
        return Promise.resolve({
          ...BASE_LIST,
          issues: [{ key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task', extraFields: {} }],
        });
      }
      if (path === '/api/queries/q1/issues/PROJ-1') {
        return Promise.resolve({
          key: 'PROJ-1',
          summary: 'Ticket un',
          status: 'Open',
          issueType: 'Task',
          fields: [{ id: 'f1', name: 'Raison Sociale', value: 'Acme' }],
          attachments: [],
        });
      }
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });

    renderWithProviders(<IssueList />);

    const keyButton = await screen.findByRole('button', { name: 'PROJ-1' });
    fireEvent.click(keyButton);

    expect(await screen.findByRole('heading', { name: 'Ticket un' })).toBeInTheDocument();
    expect(screen.getByText('Raison Sociale')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('renders the configured list columns and filters the table by them', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ...BASE_LIST,
      listColumns: [{ fieldName: 'Profil Export' }, { fieldName: 'Offre Export' }],
      issues: [
        {
          key: 'PROJ-1',
          summary: 'Ticket un',
          status: 'Open',
          issueType: 'Task',
          extraFields: { 'Profil Export': 'Débutant', 'Offre Export': 'Premium' },
        },
        {
          key: 'PROJ-2',
          summary: 'Ticket deux',
          status: 'Done',
          issueType: 'Task',
          extraFields: { 'Profil Export': 'Avancé', 'Offre Export': 'Standard' },
        },
      ],
    });

    renderWithProviders(<IssueList />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Débutant')).toBeInTheDocument();
    expect(within(table).getByText('Premium')).toBeInTheDocument();
    expect(within(table).getByText('Avancé')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Profil Export'), { target: { value: 'Débutant' } });

    expect(within(table).getByText('PROJ-1')).toBeInTheDocument();
    expect(within(table).queryByText('PROJ-2')).not.toBeInTheDocument();
  });
});
