import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssueDetailDrawer } from '../src/components/IssueDetailDrawer';
import { setAuth } from '../src/lib/authStore';
import type { QueryTab } from '../src/types/query';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch, apiFetchBlob } from '../src/lib/apiClient';

const ISSUE_DETAIL = {
  key: 'PROJ-1',
  summary: 'Ticket un',
  status: 'Open',
  issueType: 'Task',
  fields: [
    { id: 'f1', name: 'Raison Sociale', value: 'Acme' },
    { id: 'f2', name: 'customfield_99999', value: 'mystery' },
    { id: 'f3', name: 'Pays cibles', value: 'France' },
  ],
  attachments: [],
};

// Config d'onglets de la requête (remplace la constante statique) : "Infos"
// visible pour tous, "Réalisation et prévision" réservé aux admins.
const TABS: QueryTab[] = [
  { id: 'infos', label: 'Infos', position: 0, visibleToUser: true, fields: [{ fieldName: 'Raison Sociale' }] },
  {
    id: 'realisation',
    label: 'Réalisation et prévision',
    position: 1,
    visibleToUser: false,
    fields: [{ fieldName: 'Pays cibles' }],
  },
];

function renderDrawer(autresVisibleToUser = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IssueDetailDrawer
        queryId="q1"
        tabs={TABS}
        autresVisibleToUser={autresVisibleToUser}
        issueKey="PROJ-1"
        isExpanded={false}
        onClose={() => {}}
        onToggleExpand={() => {}}
      />
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

  it('shows the "Autres" tab to a USER when the query marks it visible', async () => {
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER' },
    });

    renderDrawer(true);
    await screen.findByText('Raison Sociale');

    fireEvent.click(screen.getByRole('button', { name: 'Autres' }));
    expect(await screen.findByText('customfield_99999')).toBeInTheDocument();
  });
});

describe('IssueDetailDrawer — "Réalisation et prévision" tab visibility by role', () => {
  it('hides the tab (and its fields) for the USER role', async () => {
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER' },
    });

    renderDrawer();

    await screen.findByText('Raison Sociale');
    expect(screen.queryByRole('button', { name: 'Réalisation et prévision' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pays cibles')).not.toBeInTheDocument();
  });

  it('shows the tab with its fields for the ADMIN role', async () => {
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'a1', email: 'a@example.com', name: 'A', role: 'ADMIN' },
    });

    renderDrawer();
    await screen.findByText('Raison Sociale');

    fireEvent.click(screen.getByRole('button', { name: 'Réalisation et prévision' }));

    expect(await screen.findByText('Pays cibles')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
  });
});

describe('IssueDetailDrawer — attachments filtered by reporter for the USER role', () => {
  const ISSUE_WITH_ATTACHMENTS = {
    ...ISSUE_DETAIL,
    reporterId: 'jdupont',
    reporterName: 'Jean Dupont',
    attachments: [
      {
        id: '1001',
        filename: 'cahier-des-charges.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        contentUrl: 'x',
        authorId: 'jdupont',
        authorName: 'Jean Dupont',
      },
      {
        id: '1002',
        filename: 'note-interne.docx',
        mimeType: 'application/msword',
        size: 2048,
        contentUrl: 'x',
        authorId: 'agent42',
        authorName: 'Agent Support',
      },
    ],
  };

  it('shows only the reporter’s attachments for the USER role', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ISSUE_WITH_ATTACHMENTS);
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER' },
    });

    renderDrawer();

    expect(await screen.findByText('cahier-des-charges.pdf')).toBeInTheDocument();
    expect(screen.queryByText('note-interne.docx')).not.toBeInTheDocument();
  });

  it('shows every attachment for the ADMIN role', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ISSUE_WITH_ATTACHMENTS);
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'a1', email: 'a@example.com', name: 'A', role: 'ADMIN' },
    });

    renderDrawer();

    expect(await screen.findByText('cahier-des-charges.pdf')).toBeInTheDocument();
    expect(screen.getByText('note-interne.docx')).toBeInTheDocument();
  });

  it('offers a zip download of every visible attachment when there are several', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ISSUE_WITH_ATTACHMENTS);
    vi.mocked(apiFetchBlob).mockResolvedValue(new Blob(['zip']));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:zip'), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'a1', email: 'a@example.com', name: 'A', role: 'ADMIN' },
    });

    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: /Tout télécharger \(2\)/ }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(apiFetchBlob).toHaveBeenCalledWith('/api/queries/q1/issues/PROJ-1/attachments.zip');
    clickSpy.mockRestore();
  });

  it('shows the number of visible attachments in the ticket detail', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ISSUE_WITH_ATTACHMENTS);
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER' },
    });

    renderDrawer();

    // USER : seule la pièce jointe du rapporteur est visible et comptée.
    expect(await screen.findByText('Pièces jointes : 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pièces jointes 1' })).toBeInTheDocument();
  });

  it('hides the zip button when only one attachment is visible', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ISSUE_WITH_ATTACHMENTS);
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'u1', email: 'u@example.com', name: 'U', role: 'USER' },
    });

    renderDrawer();

    expect(await screen.findByText('cahier-des-charges.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tout télécharger/ })).not.toBeInTheDocument();
  });

  it('shows an error when the archive cannot be built', async () => {
    vi.mocked(apiFetch).mockResolvedValue(ISSUE_WITH_ATTACHMENTS);
    vi.mocked(apiFetchBlob).mockRejectedValue(new Error('network'));
    setAuth({
      accessToken: 't',
      refreshToken: 'r',
      user: { id: 'a1', email: 'a@example.com', name: 'A', role: 'ADMIN' },
    });

    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: /Tout télécharger/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Erreur lors de la création de l'archive");
  });
});
