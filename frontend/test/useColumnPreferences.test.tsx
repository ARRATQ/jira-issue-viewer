import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnPreferences } from '../src/hooks/useColumnPreferences';
import type { FieldRef } from '../src/types/query';

const DEFAULTS: FieldRef[] = [{ fieldName: 'Profil' }];
const AVAILABLE: FieldRef[] = [{ fieldName: 'Profil' }, { fieldName: 'Raison Sociale' }, { fieldName: 'Ville' }];
const STORAGE_KEY = 'jira-issue-viewer.columns.u1.q1';

function renderPrefs() {
  return renderHook(() => useColumnPreferences('u1', 'q1', DEFAULTS, AVAILABLE));
}

beforeEach(() => {
  localStorage.clear();
});

describe('useColumnPreferences', () => {
  it('shows the admin default columns when nothing is stored', () => {
    const { result } = renderPrefs();
    expect(result.current.visibleColumns).toEqual([{ fieldName: 'Profil' }]);
    expect(result.current.isCustomized).toBe(false);
  });

  it('toggles a column on, keeps the available order and persists the choice', () => {
    const { result } = renderPrefs();

    act(() => result.current.toggleColumn('Ville'));
    act(() => result.current.toggleColumn('Raison Sociale'));

    expect(result.current.visibleColumns.map((c) => c.fieldName)).toEqual(['Profil', 'Raison Sociale', 'Ville']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['Profil', 'Ville', 'Raison Sociale']);
    expect(result.current.isCustomized).toBe(true);
  });

  it('toggles a column off', () => {
    const { result } = renderPrefs();
    act(() => result.current.toggleColumn('Profil'));
    expect(result.current.visibleColumns).toEqual([]);
  });

  it('restores the stored choice and ignores fields that are no longer available', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['Ville', 'Champ supprimé']));
    const { result } = renderPrefs();
    expect(result.current.visibleColumns).toEqual([{ fieldName: 'Ville' }]);
  });

  it('falls back to defaults when the stored value is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const { result } = renderPrefs();
    expect(result.current.visibleColumns).toEqual(DEFAULTS);
  });

  it('resets to the admin defaults and clears the stored choice', () => {
    const { result } = renderPrefs();
    act(() => result.current.toggleColumn('Ville'));
    act(() => result.current.resetColumns());

    expect(result.current.visibleColumns).toEqual(DEFAULTS);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.isCustomized).toBe(false);
  });
});
