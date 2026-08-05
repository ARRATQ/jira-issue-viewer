import { describe, it, expect } from 'vitest';
import { groupIssueFields } from '../src/lib/issueFieldGroups';
import type { IssueField } from '../src/types/issue';
import type { QueryTab } from '../src/types/query';

function field(id: string, name: string, value: unknown = 'x'): IssueField {
  return { id, name, value };
}

// Config d'onglets de test (remplace la constante statique historique) : le
// regroupement est désormais paramétré par la config de la requête.
const TABS: QueryTab[] = [
  {
    id: 'infos',
    label: 'Infos',
    position: 0,
    visibleToUser: true,
    fields: [{ fieldName: 'Raison Sociale' }, { fieldName: 'ICE' }],
  },
  {
    id: 'contact',
    label: 'Contact',
    position: 1,
    visibleToUser: true,
    fields: [{ fieldName: 'Genre' }, { fieldName: 'GSM' }],
  },
];

describe('groupIssueFields', () => {
  it('places a field under the matching business tab', () => {
    const groups = groupIssueFields([field('f1', 'Raison Sociale', 'Acme'), field('f2', 'GSM', '0600000000')], TABS);

    const infos = groups.find((g) => g.id === 'infos');
    const contact = groups.find((g) => g.id === 'contact');

    expect(infos?.fields).toEqual([field('f1', 'Raison Sociale', 'Acme')]);
    expect(contact?.fields).toEqual([field('f2', 'GSM', '0600000000')]);
  });

  it('matches names case-insensitively and ignores a trailing colon', () => {
    const groups = groupIssueFields([field('f1', 'genre:', 'M.')], TABS);
    const contact = groups.find((g) => g.id === 'contact');
    expect(contact?.fields).toHaveLength(1);
  });

  it('preserves the declared tab field order rather than the input array order', () => {
    const groups = groupIssueFields([field('f2', 'ICE', '123'), field('f1', 'Raison Sociale', 'Acme')], TABS);
    const infos = groups.find((g) => g.id === 'infos');
    expect(infos?.fields.map((f) => f.name)).toEqual(['Raison Sociale', 'ICE']);
  });

  it('orders tabs by position, not by array order', () => {
    const shuffled: QueryTab[] = [TABS[1]!, TABS[0]!];
    const groups = groupIssueFields([], shuffled);
    expect(groups.map((g) => g.id)).toEqual(['infos', 'contact', 'autres']);
  });

  it('puts unmatched fields under "Autres" without dropping any', () => {
    const groups = groupIssueFields([field('f1', 'customfield_99999', 'mystery value')], TABS);
    const autres = groups.find((g) => g.id === 'autres');
    expect(autres?.fields).toEqual([field('f1', 'customfield_99999', 'mystery value')]);
  });

  it('propagates each tab visibility, and "Autres" gets autresVisibleToUser', () => {
    const groups = groupIssueFields([], TABS, true);
    expect(groups.find((g) => g.id === 'infos')?.visibleToUser).toBe(true);
    expect(groups.find((g) => g.id === 'autres')?.visibleToUser).toBe(true);

    const hidden = groupIssueFields([], TABS, false);
    expect(hidden.find((g) => g.id === 'autres')?.visibleToUser).toBe(false);
  });

  it('never assigns the same field to two tabs', () => {
    const groups = groupIssueFields([field('f1', 'GSM', '0600000000')], TABS);
    const totalOccurrences = groups.flatMap((g) => g.fields).filter((f) => f.id === 'f1').length;
    expect(totalOccurrences).toBe(1);
  });
});
