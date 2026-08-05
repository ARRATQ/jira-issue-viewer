import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FieldPicker } from '../src/components/FieldPicker';
import type { FieldRef } from '../src/types/query';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetch } from '../src/lib/apiClient';

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({
    fields: [
      { id: 'customfield_1', name: 'Profil Export' },
      { id: 'customfield_2', name: 'Offre Export' },
      { id: 'customfield_3', name: 'Raison Sociale' },
    ],
  });
});

describe('FieldPicker', () => {
  it('suggests catalogue fields matching the search and adds the chosen one', async () => {
    const onChange = vi.fn();
    renderWithProviders(<FieldPicker label="Colonnes" value={[]} onChange={onChange} />);

    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'export' } });

    // Deux champs contiennent "export", "Raison Sociale" est exclu.
    expect(await screen.findByRole('button', { name: 'Profil Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offre Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raison Sociale' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Profil Export' }));

    expect(onChange).toHaveBeenCalledWith([{ fieldName: 'Profil Export', fieldId: 'customfield_1' }]);
  });

  it('does not suggest an already-selected field', async () => {
    const value: FieldRef[] = [{ fieldName: 'Profil Export', fieldId: 'customfield_1' }];
    renderWithProviders(<FieldPicker label="Colonnes" value={value} onChange={vi.fn()} />);

    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'export' } });

    expect(screen.queryByRole('button', { name: 'Profil Export' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Offre Export' })).toBeInTheDocument();
  });

  it('removes a selected field via its chip', async () => {
    const onChange = vi.fn();
    const value: FieldRef[] = [
      { fieldName: 'Profil Export', fieldId: 'customfield_1' },
      { fieldName: 'Offre Export', fieldId: 'customfield_2' },
    ];
    renderWithProviders(<FieldPicker label="Colonnes" value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer Profil Export' }));

    expect(onChange).toHaveBeenCalledWith([{ fieldName: 'Offre Export', fieldId: 'customfield_2' }]);
  });
});
