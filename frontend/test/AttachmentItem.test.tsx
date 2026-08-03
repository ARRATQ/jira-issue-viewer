import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttachmentItem } from '../src/components/AttachmentItem';

vi.mock('../src/lib/apiClient', () => ({
  apiFetchBlob: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { apiFetchBlob } from '../src/lib/apiClient';

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

describe('AttachmentItem', () => {
  it('shows a preview toggle for images and reveals an <img> after loading', async () => {
    vi.mocked(apiFetchBlob).mockResolvedValue(new Blob(['fake'], { type: 'image/png' }));

    render(
      <AttachmentItem
        issueKey="PROJ-1"
        attachment={{ id: '1', filename: 'photo.png', mimeType: 'image/png', size: 1024, contentUrl: 'x' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Aperçu/i }));

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(apiFetchBlob).toHaveBeenCalledWith('/api/issues/PROJ-1/attachments/1');
  });

  it('does not show a preview toggle for non-previewable types, only download', () => {
    render(
      <AttachmentItem
        issueKey="PROJ-1"
        attachment={{
          id: '2',
          filename: 'data.xlsx',
          mimeType: 'application/vnd.ms-excel',
          size: 2048,
          contentUrl: 'x',
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Aperçu/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Télécharger/i })).toBeInTheDocument();
  });

  it('shows an error message when loading the preview fails', async () => {
    vi.mocked(apiFetchBlob).mockRejectedValue(new Error('network error'));

    render(
      <AttachmentItem
        issueKey="PROJ-1"
        attachment={{ id: '3', filename: 'photo.png', mimeType: 'image/png', size: 1024, contentUrl: 'x' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Aperçu/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
