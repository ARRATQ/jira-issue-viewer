import { describe, it, expect } from 'vitest';
import { describeActiveFilters } from '../src/lib/activeFilters';
import { DEFAULT_VIEW } from '../src/lib/issueListView';
import { EMPTY_FILTER, NOT_EMPTY_FILTER } from '../src/lib/issueTable';

const VISIBLE = ['Profil', 'Raison Sociale', 'ICE', 'Created', 'Masquée'];
const TEXT = new Set(['Raison Sociale', 'ICE']);
const DATES = new Set(['Created']);

describe('describeActiveFilters', () => {
  it('returns nothing when no filter is active', () => {
    expect(describeActiveFilters({ ...DEFAULT_VIEW, pageSize: 25 }, VISIBLE, TEXT, DATES)).toEqual([]);
  });

  it('describes every active filter in display order', () => {
    const chips = describeActiveFilters(
      {
        ...DEFAULT_VIEW,
        pageSize: 25,
        search: ' acme ',
        status: 'Done',
        columnFilters: { Profil: 'Avancé', 'Raison Sociale': 'glob', ICE: EMPTY_FILTER, Absente: 'x' },
        dateFilters: { Created: { from: '2026-10-01', to: '2026-10-31' } },
      },
      VISIBLE,
      TEXT,
      DATES,
    );
    expect(chips).toEqual([
      { id: 'search', kind: 'search', label: 'Recherche : « acme »' },
      { id: 'status', kind: 'status', label: 'Statut : Done' },
      { id: 'column:Profil', kind: 'column', field: 'Profil', label: 'Profil : Avancé' },
      { id: 'column:Raison Sociale', kind: 'column', field: 'Raison Sociale', label: 'Raison Sociale contient « glob »' },
      { id: 'column:ICE', kind: 'column', field: 'ICE', label: 'ICE : vide' },
      { id: 'date:Created', kind: 'date', field: 'Created', label: 'Created : du 01/10/2026 au 31/10/2026' },
    ]);
  });

  it('describes open-ended periods and the "not empty" filter', () => {
    const chips = describeActiveFilters(
      {
        ...DEFAULT_VIEW,
        pageSize: 25,
        columnFilters: { Profil: NOT_EMPTY_FILTER },
        dateFilters: { Created: { from: '2026-10-01', to: '' } },
      },
      VISIBLE,
      TEXT,
      DATES,
    );
    expect(chips.map((c) => c.label)).toEqual(['Profil : non vide', 'Created : à partir du 01/10/2026']);

    const until = describeActiveFilters(
      { ...DEFAULT_VIEW, pageSize: 25, dateFilters: { Created: { from: '', to: '2026-10-31' } } },
      VISIBLE,
      TEXT,
      DATES,
    );
    expect(until.map((c) => c.label)).toEqual(["Created : jusqu'au 31/10/2026"]);
  });
});
