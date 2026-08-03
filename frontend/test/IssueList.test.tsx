import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { IssueList } from '../src/pages/IssueList';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

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
});

describe('IssueList', () => {
  it('shows a loading state, then the issue table', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      jql: 'project = PROJ',
      issues: [{ key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task' }],
    });

    renderWithProviders(<IssueList />);

    expect(screen.getByText(/Chargement/i)).toBeInTheDocument();
    expect(await screen.findByText('PROJ-1')).toBeInTheDocument();
    expect(screen.getByText('Ticket un')).toBeInTheDocument();
    expect(screen.getByText('project = PROJ')).toBeInTheDocument();
  });

  it('shows an empty state when there are no issues', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ jql: 'project = PROJ', issues: [] });
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
      if (path === '/api/issues') {
        return Promise.resolve({
          jql: 'project = PROJ',
          issues: [{ key: 'PROJ-1', summary: 'Ticket un', status: 'Open', issueType: 'Task' }],
        });
      }
      if (path === '/api/issues/PROJ-1') {
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
});
