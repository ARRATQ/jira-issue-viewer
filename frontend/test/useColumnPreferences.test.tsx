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

  it('toggles a column on, keeps the chosen order and persists the choice', () => {
    const { result } = renderPrefs();

    act(() => result.current.toggleColumn('Ville'));
    act(() => result.current.toggleColumn('Raison Sociale'));

    expect(result.current.visibleColumns.map((c) => c.fieldName)).toEqual(['Profil', 'Ville', 'Raison Sociale']);
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

  describe('moveColumn', () => {
    function renderWithAll() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['Profil', 'Raison Sociale', 'Ville']));
      return renderPrefs();
    }
    const order = (r: ReturnType<typeof renderPrefs>['result']) => r.current.visibleColumns.map((c) => c.fieldName);

    it('moves a column to the right, onto the target position, and persists the order', () => {
      const { result } = renderWithAll();
      act(() => result.current.moveColumn('Profil', 'Ville'));

      expect(order(result)).toEqual(['Raison Sociale', 'Ville', 'Profil']);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['Raison Sociale', 'Ville', 'Profil']);
      expect(result.current.isCustomized).toBe(true);
    });

    it('moves a column to the left', () => {
      const { result } = renderWithAll();
      act(() => result.current.moveColumn('Ville', 'Profil'));
      expect(order(result)).toEqual(['Ville', 'Profil', 'Raison Sociale']);
    });

    it('starts from the admin defaults when nothing is stored', () => {
      const { result } = renderHook(() =>
        useColumnPreferences('u1', 'q1', [{ fieldName: 'Profil' }, { fieldName: 'Ville' }], AVAILABLE),
      );
      act(() => result.current.moveColumn('Ville', 'Profil'));
      expect(order(result)).toEqual(['Ville', 'Profil']);
    });

    it('ignores a move onto itself or onto a column that is not displayed', () => {
      const { result } = renderWithAll();
      act(() => result.current.moveColumn('Profil', 'Profil'));
      act(() => result.current.moveColumn('Profil', 'Inconnu'));
      expect(order(result)).toEqual(['Profil', 'Raison Sociale', 'Ville']);
    });
  });
});
