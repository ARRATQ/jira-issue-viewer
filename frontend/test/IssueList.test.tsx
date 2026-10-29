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

vi.mock('../src/lib/csvExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/csvExport')>();
  return { ...actual, downloadCsv: vi.fn() };
});

import { apiFetch } from '../src/lib/apiClient';
import { downloadCsv } from '../src/lib/csvExport';

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
  availableColumns: [],
  tabs: [{ id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] }],
  autresVisibleToUser: false,
  issues: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// Deux issues, une colonne par défaut (Profil Export) et un champ d'onglet
// visible (Raison Sociale) que l'utilisateur peut ajouter au tableau.
const LIST_WITH_AVAILABLE_COLUMNS = {
  ...BASE_LIST,
  listColumns: [{ fieldName: 'Profil Export' }],
  availableColumns: [{ fieldName: 'Profil Export' }, { fieldName: 'Raison Sociale' }],
  issues: [
    {
      key: 'PROJ-1',
      summary: 'Ticket un',
      status: 'Open',
      issueType: 'Task',
      extraFields: { 'Profil Export': 'Débutant', 'Raison Sociale': 'Acme' },
    },
    {
      key: 'PROJ-2',
      summary: 'Ticket deux',
      status: 'Done',
      issueType: 'Task',
      extraFields: { 'Profil Export': 'Avancé', 'Raison Sociale': 'Globex' },
    },
  ],
};

// 30 issues : PROJ-1..15 "Open", PROJ-16..30 "Done" — plus d'une page à 25.
const LIST_WITH_30_ISSUES = {
  ...BASE_LIST,
  issues: Array.from({ length: 30 }, (_, i) => ({
    key: `PROJ-${i + 1}`,
    summary: `Ticket ${i + 1}`,
    status: i < 15 ? 'Open' : 'Done',
    issueType: 'Task',
    extraFields: {},
  })),
};

function bodyRowCount(table: HTMLElement): number {
  return within(table).getAllByRole('row').length - 1;
}

function exportedCsv(): string {
  return vi.mocked(downloadCsv).mock.calls[0]![1];
}

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
      availableColumns: [{ fieldName: 'Profil Export' }, { fieldName: 'Offre Export' }],
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

  it('lets the user add an available field as a column', async () => {
    vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_AVAILABLE_COLUMNS);
    renderWithProviders(<IssueList />);

    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Acme')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Raison Sociale' }));

    expect(within(table).getByRole('columnheader', { name: 'Raison Sociale' })).toBeInTheDocument();
    expect(within(table).getByText('Acme')).toBeInTheDocument();
    expect(screen.getByLabelText('Raison Sociale', { selector: 'select' })).toBeInTheDocument();
  });

  it('removing a column drops its header and its active filter', async () => {
    vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_AVAILABLE_COLUMNS);
    renderWithProviders(<IssueList />);

    const table = await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Profil Export'), { target: { value: 'Débutant' } });
    expect(within(table).queryByText('PROJ-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Profil Export' }));

    expect(within(table).queryByRole('columnheader', { name: 'Profil Export' })).not.toBeInTheDocument();
    expect(within(table).getByText('PROJ-2')).toBeInTheDocument();
  });

  it('exports the displayed columns of the filtered issues as CSV', async () => {
    vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_AVAILABLE_COLUMNS);
    renderWithProviders(<IssueList />);

    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Raison Sociale' }));
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'Done' } });

    fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/ }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadCsv).mock.calls[0]![0]).toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = exportedCsv().replace('\uFEFF', '').split('\r\n');
    expect(lines).toEqual(['Clé;Résumé;Statut;Type;Profil Export;Raison Sociale', 'PROJ-2;Ticket deux;Done;Task;Avancé;Globex']);
  });

  it('disables the export when the active filters match no issue', async () => {
    vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_AVAILABLE_COLUMNS);
    renderWithProviders(<IssueList />);

    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /Exporter CSV/ })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'Done' } });
    fireEvent.change(screen.getByLabelText('Profil Export'), { target: { value: 'Débutant' } });

    expect(screen.getByText(/Aucune issue ne correspond à ces filtres/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter CSV/ })).toBeDisabled();
  });

  describe('pagination', () => {
    it('shows 25 issues per page by default and navigates to the next page', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_30_ISSUES);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      expect(bodyRowCount(table)).toBe(25);
      expect(screen.getByText('1–25 sur 30')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));

      expect(bodyRowCount(table)).toBe(5);
      expect(within(table).getByText('PROJ-26')).toBeInTheDocument();
      expect(within(table).queryByText('PROJ-1')).not.toBeInTheDocument();
      expect(screen.getByText('26–30 sur 30')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
    });

    it('changes the page size and goes back to page 1', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_30_ISSUES);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
      fireEvent.change(screen.getByLabelText('Par page'), { target: { value: '50' } });

      expect(bodyRowCount(table)).toBe(30);
      expect(screen.getByText('1–30 sur 30')).toBeInTheDocument();
    });

    it('goes back to page 1 when a filter changes', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_30_ISSUES);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
      fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'Done' } });

      expect(within(table).getByText('PROJ-16')).toBeInTheDocument();
      expect(screen.getByText('1–15 sur 15')).toBeInTheDocument();
    });

    it('exports every filtered issue, not only the current page', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_30_ISSUES);
      renderWithProviders(<IssueList />);

      await screen.findByRole('table');
      fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/ }));

      const lines = exportedCsv().replace('\uFEFF', '').split('\r\n');
      expect(lines).toHaveLength(31);
    });
  });

  describe('date columns', () => {
    const createdIssue = (n: number, created: string) => ({
      key: `PROJ-${n}`,
      summary: `Ticket ${n}`,
      status: 'Open',
      issueType: 'Task',
      extraFields: { Created: created },
    });
    const LIST_WITH_CREATED = {
      ...BASE_LIST,
      listColumns: [{ fieldName: 'Created' }],
      availableColumns: [{ fieldName: 'Created' }],
      issues: [
        createdIssue(1, '2026-10-01T09:15:00.000+0100'),
        createdIssue(2, '2026-10-15T10:00:00.000+0100'),
        createdIssue(3, '2026-10-28T23:00:37.887+0100'),
      ],
    };

    it('shows the date without the time', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_CREATED);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      expect(within(table).getByText('28/10/2026')).toBeInTheDocument();
      expect(within(table).queryByText(/T23:00/)).not.toBeInTheDocument();
    });

    it('filters on a from/to period instead of a list of values', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_CREATED);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      expect(screen.queryByLabelText('Created', { selector: 'select' })).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Created du'), { target: { value: '2026-10-10' } });
      expect(bodyRowCount(table)).toBe(2);
      expect(within(table).queryByText('PROJ-1')).not.toBeInTheDocument();

      // Borne "au" inclusive : l'issue créée le 28 au soir reste dans la période.
      fireEvent.change(screen.getByLabelText('Created au'), { target: { value: '2026-10-28' } });
      expect(bodyRowCount(table)).toBe(2);

      fireEvent.change(screen.getByLabelText('Created au'), { target: { value: '2026-10-20' } });
      expect(bodyRowCount(table)).toBe(1);
      expect(within(table).getByText('PROJ-2')).toBeInTheDocument();
    });

    it('exports dates without the time', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_CREATED);
      renderWithProviders(<IssueList />);

      await screen.findByRole('table');
      fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/ }));

      const lines = exportedCsv().replace('\uFEFF', '').split('\r\n');
      expect(lines[3]).toBe('PROJ-3;Ticket 3;Open;Task;28/10/2026');
    });
  });

  describe('lot 1: pills, text search, sort, reset', () => {
    it('shows the status as a pill colored by its Jira category', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ...BASE_LIST,
        issues: [
          { key: 'PROJ-1', summary: 'Un', status: 'En cours', statusCategory: 'indeterminate', issueType: 'Task', extraFields: {} },
          { key: 'PROJ-2', summary: 'Deux', status: 'Clôturé', statusCategory: null, issueType: 'Task', extraFields: {} },
        ],
      });
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      expect(within(table).getByText('En cours')).toHaveClass('status-pill', 'status-pill--indeterminate');
      expect(within(table).getByText('Clôturé')).toHaveClass('status-pill', 'status-pill--unknown');
    });

    it('offers a "contains" text search for columns with many distinct values', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        ...BASE_LIST,
        listColumns: [{ fieldName: 'Raison Sociale' }, { fieldName: 'Profil Export' }],
        availableColumns: [{ fieldName: 'Raison Sociale' }, { fieldName: 'Profil Export' }],
        issues: Array.from({ length: 20 }, (_, i) => ({
          key: `PROJ-${i + 1}`,
          summary: `Ticket ${i + 1}`,
          status: 'Open',
          statusCategory: 'new',
          issueType: 'Task',
          extraFields: {
            'Raison Sociale': i === 4 ? 'Société Générale Maroc' : `Entreprise ${i + 1}`,
            'Profil Export': i % 2 ? 'Avancé' : 'Débutant',
          },
        })),
      });
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      expect(screen.getByLabelText('Profil Export', { selector: 'select' })).toBeInTheDocument();
      const search = screen.getByLabelText('Raison Sociale', { selector: 'input' });

      fireEvent.change(search, { target: { value: 'societe gen' } });

      expect(bodyRowCount(table)).toBe(1);
      expect(within(table).getByText('PROJ-5')).toBeInTheDocument();
    });

    it('sorts by a column when its header is clicked, then reverses, then restores the Jira order', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_AVAILABLE_COLUMNS);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      const firstKey = () => within(within(table).getAllByRole('row')[1]!).getAllByRole('cell')[0]!.textContent;
      const header = within(table).getByRole('columnheader', { name: /Profil Export/ });

      fireEvent.click(within(header).getByRole('button'));
      expect(header).toHaveAttribute('aria-sort', 'ascending');
      expect(firstKey()).toBe('PROJ-2');

      fireEvent.click(within(header).getByRole('button'));
      expect(header).toHaveAttribute('aria-sort', 'descending');
      expect(firstKey()).toBe('PROJ-1');

      fireEvent.click(within(header).getByRole('button'));
      expect(header).not.toHaveAttribute('aria-sort');
      expect(firstKey()).toBe('PROJ-1');
    });

    it('resets every active filter in one click', async () => {
      vi.mocked(apiFetch).mockResolvedValue(LIST_WITH_AVAILABLE_COLUMNS);
      renderWithProviders(<IssueList />);

      const table = await screen.findByRole('table');
      const reset = screen.getByRole('button', { name: /Réinitialiser les filtres/ });
      expect(reset).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'Done' } });
      expect(bodyRowCount(table)).toBe(1);
      expect(reset).toBeEnabled();

      fireEvent.click(reset);
      expect(bodyRowCount(table)).toBe(2);
      expect(screen.getByLabelText('Statut')).toHaveValue('');
      expect(reset).toBeDisabled();
    });
  });

  it('warns that the list is truncated when Jira has more issues than were loaded', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...LIST_WITH_30_ISSUES, total: 4200, truncated: true });
    renderWithProviders(<IssueList />);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('30 premières issues sur 4200');
    expect(banner).toHaveTextContent(/affinez le JQL/);
  });

  it('shows no truncation warning when every issue was loaded', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...LIST_WITH_30_ISSUES, total: 30, truncated: false });
    renderWithProviders(<IssueList />);

    await screen.findByRole('table');
    expect(screen.queryByText(/premières issues sur/)).not.toBeInTheDocument();
  });
});
