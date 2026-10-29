import { describe, it, expect } from 'vitest';
import { DEFAULT_VIEW, parseView, serializeView } from '../src/lib/issueListView';
import type { IssueListView } from '../src/lib/issueListView';

const PAGE_SIZES = [25, 50, 100] as const;

function parse(query: string): IssueListView {
  return parseView(new URLSearchParams(query), PAGE_SIZES);
}

describe('issueListView', () => {
  it('returns the default view for an empty URL', () => {
    expect(parse('')).toEqual({ ...DEFAULT_VIEW, pageSize: 25 });
  });

  it('reads search, status, column and date filters, sort and pagination', () => {
    const view = parse(
      'q=acme&statut=Done&f.Raison+Sociale=Globex&du.Created=2026-10-01&au.Created=2026-10-31&tri=summary&ordre=desc&page=3&parPage=50',
    );
    expect(view).toEqual({
      search: 'acme',
      status: 'Done',
      columnFilters: { 'Raison Sociale': 'Globex' },
      dateFilters: { Created: { from: '2026-10-01', to: '2026-10-31' } },
      sort: { column: 'summary', direction: 'desc' },
      page: 3,
      pageSize: 50,
    });
  });

  it('ignores invalid values instead of failing', () => {
    const view = parse('tri=summary&ordre=sideways&page=-2&parPage=7&du.Created=hier&f.Ville=');
    expect(view.sort).toEqual({ column: 'summary', direction: 'asc' });
    expect(view.page).toBe(1);
    expect(view.pageSize).toBe(25);
    expect(view.dateFilters).toEqual({});
    expect(view.columnFilters).toEqual({});
  });

  it('writes only what differs from the defaults', () => {
    expect(serializeView({ ...DEFAULT_VIEW, pageSize: 25 }, 25).toString()).toBe('');
    const params = serializeView(
      {
        search: ' acme ',
        status: 'Done',
        columnFilters: { 'Raison Sociale': 'Globex', Ville: '' },
        dateFilters: { Created: { from: '2026-10-01', to: '' } },
        sort: { column: 'key', direction: 'asc' },
        page: 2,
        pageSize: 100,
      },
      25,
    );
    expect(Object.fromEntries(params)).toEqual({
      q: ' acme ',
      statut: 'Done',
      'f.Raison Sociale': 'Globex',
      'du.Created': '2026-10-01',
      tri: 'key',
      ordre: 'asc',
      page: '2',
      parPage: '100',
    });
  });

  it('round-trips a view through the URL', () => {
    const view: IssueListView = {
      search: 'société',
      status: 'En cours',
      columnFilters: { 'Nom & Prénom': ':vide' },
      dateFilters: { Created: { from: '', to: '2026-10-28' } },
      sort: { column: 'Created', direction: 'desc' },
      page: 1,
      pageSize: 50,
    };
    expect(parseView(new URLSearchParams(serializeView(view, 25).toString()), PAGE_SIZES)).toEqual(view);
  });
});
