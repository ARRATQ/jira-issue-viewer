import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssueDetailDrawer } from '../src/components/IssueDetailDrawer';
import { setAuth } from '../src/lib/authStore';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

const ISSUE_DETAIL = {
  key: 'PROJ-1',
  summary: 'Ticket un',
  status: 'Open',
  issueType: 'Task',
  fields: [
    { id: 'f1', name: 'Raison Sociale', value: 'Acme' },
    { id: 'f2', name: 'customfield_99999', value: 'mystery' },
  ],
  attachments: [],
};

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IssueDetailDrawer issueKey="PROJ-1" isExpanded={false} onClose={() => {}} onToggleExpand={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue(ISSUE_DETAIL);
});

describe('IssueDetailDrawer — "Autres" tab visibility by role', () => {
  it('hides the "Autres" tab (and its fields) for the USER role', async () => {
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER' },
    });

    renderDrawer();

    expect(await screen.findByText('Raison Sociale')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Autres' })).not.toBeInTheDocument();
    expect(screen.queryByText('customfield_99999')).not.toBeInTheDocument();
  });

  it('shows the "Autres" tab with unmatched fields for the ADMIN role', async () => {
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'a1', email: 'a@example.com', name: 'A', role: 'ADMIN' },
    });

    renderDrawer();
    await screen.findByText('Raison Sociale');

    fireEvent.click(screen.getByRole('button', { name: 'Autres' }));

    expect(await screen.findByText('customfield_99999')).toBeInTheDocument();
  });
});
