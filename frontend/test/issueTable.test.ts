import { describe, it, expect } from 'vitest';
import { matchesText, nextSort, sortIssues } from '../src/lib/issueTable';
import type { IssueSummary } from '../src/types/issue';

function issue(key: string, extraFields: Record<string, string | null> = {}, status: string | null = null): IssueSummary {
  return { key, summary: key, status, statusCategory: null, issueType: null, extraFields };
}

describe('matchesText', () => {
  it('matches a fragment ignoring case and accents', () => {
    expect(matchesText('Société Générale', 'societe gen')).toBe(true);
    expect(matchesText('ACME Maroc', 'maroc')).toBe(true);
  });

  it('rejects a value that does not contain the query', () => {
    expect(matchesText('Acme', 'globex')).toBe(false);
    expect(matchesText(null, 'acme')).toBe(false);
  });

  it('accepts everything when the query is blank', () => {
    expect(matchesText(null, '  ')).toBe(true);
  });
});

describe('sortIssues', () => {
  const issues = [issue('PROJ-10', { Nom: 'Zoé' }), issue('PROJ-2', { Nom: null }), issue('PROJ-1', { Nom: 'Élise' })];

  it('sorts keys in natural order', () => {
    const sorted = sortIssues(issues, { column: 'key', direction: 'asc' }, new Set());
    expect(sorted.map((i) => i.key)).toEqual(['PROJ-1', 'PROJ-2', 'PROJ-10']);
  });

  it('sorts text ignoring accents and keeps empty values last in both directions', () => {
    const asc = sortIssues(issues, { column: 'Nom', direction: 'asc' }, new Set());
    expect(asc.map((i) => i.key)).toEqual(['PROJ-1', 'PROJ-10', 'PROJ-2']);
    const desc = sortIssues(issues, { column: 'Nom', direction: 'desc' }, new Set());
    expect(desc.map((i) => i.key)).toEqual(['PROJ-10', 'PROJ-1', 'PROJ-2']);
  });

  it('sorts date columns chronologically on the date part', () => {
    const dated = [
      issue('A', { Created: '2026-10-28T08:00:00.000+0100' }),
      issue('B', { Created: '2026-01-05' }),
      issue('C', { Created: '2026-10-02T23:00:00.000+0100' }),
    ];
    const sorted = sortIssues(dated, { column: 'Created', direction: 'asc' }, new Set(['Created']));
    expect(sorted.map((i) => i.key)).toEqual(['B', 'C', 'A']);
  });

  it('returns the input order when no sort is active, without mutating it', () => {
    const copy = [...issues];
    expect(sortIssues(issues, null, new Set())).toEqual(copy);
    sortIssues(issues, { column: 'key', direction: 'asc' }, new Set());
    expect(issues).toEqual(copy);
  });
});

describe('nextSort', () => {
  it('cycles ascending, descending, then no sort', () => {
    const asc = nextSort(null, 'Nom');
    expect(asc).toEqual({ column: 'Nom', direction: 'asc' });
    const desc = nextSort(asc, 'Nom');
    expect(desc).toEqual({ column: 'Nom', direction: 'desc' });
    expect(nextSort(desc, 'Nom')).toBeNull();
  });

  it('restarts ascending when another column is clicked', () => {
    expect(nextSort({ column: 'Nom', direction: 'desc' }, 'key')).toEqual({ column: 'key', direction: 'asc' });
  });
});
