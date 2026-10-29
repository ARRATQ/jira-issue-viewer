import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useIssueListView } from '../src/hooks/useIssueListView';

const PAGE_SIZES = [25, 50, 100] as const;

function setup(url = '/queries/q1') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ ...useIssueListView(PAGE_SIZES), location: useLocation(), navigate: useNavigate() }),
    { wrapper },
  );
}

describe('useIssueListView', () => {
  it('reads the initial view from the URL', () => {
    const { result } = setup('/queries/q1?statut=Done&page=2');
    expect(result.current.view.status).toBe('Done');
    expect(result.current.view.page).toBe(2);
  });

  it('updates the view at once, mirrors it to the URL and goes back to page 1', () => {
    const { result } = setup('/queries/q1?page=3');
    act(() => result.current.updateView({ search: 'a' }));
    act(() => result.current.updateView({ search: 'ab' }));
    act(() => result.current.updateView({ search: 'abc' }));

    expect(result.current.view.search).toBe('abc');
    expect(result.current.view.page).toBe(1);
    expect(result.current.location.search).toBe('?q=abc');
  });

  it('adopts a URL changed from outside, such as a link or the back button', () => {
    const { result } = setup('/queries/q1?q=abc');
    act(() => result.current.navigate('/queries/q1?statut=Open'));
    expect(result.current.view.search).toBe('');
    expect(result.current.view.status).toBe('Open');
  });

  it('writes the URL back when an edit is undone before the router caught up', () => {
    const { result } = setup('/queries/q1');
    act(() => {
      result.current.updateView({ search: 'a' });
    });
    act(() => result.current.updateView({ search: '' }));
    expect(result.current.view.search).toBe('');
    expect(result.current.location.search).toBe('');
  });
});
