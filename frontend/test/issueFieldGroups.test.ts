import { describe, it, expect } from 'vitest';
import { groupIssueFields } from '../src/lib/issueFieldGroups';
import type { IssueField } from '../src/types/issue';

function field(id: string, name: string, value: unknown = 'x'): IssueField {
  return { id, name, value };
}

describe('groupIssueFields', () => {
  it('places a field under the matching business tab', () => {
    const groups = groupIssueFields([field('f1', 'Raison Sociale', 'Acme'), field('f2', 'GSM', '0600000000')]);

    const infos = groups.find((g) => g.id === 'infos');
    const contact = groups.find((g) => g.id === 'contact');

    expect(infos?.fields).toEqual([field('f1', 'Raison Sociale', 'Acme')]);
    expect(contact?.fields).toEqual([field('f2', 'GSM', '0600000000')]);
  });

  it('matches names case-insensitively and ignores a trailing colon', () => {
    const groups = groupIssueFields([field('f1', 'genre:', 'M.')]);
    const contact = groups.find((g) => g.id === 'contact');
    expect(contact?.fields).toHaveLength(1);
  });

  it('preserves the declared tab order rather than the input array order', () => {
    const groups = groupIssueFields([field('f2', 'ICE', '123'), field('f1', 'Raison Sociale', 'Acme')]);
    const infos = groups.find((g) => g.id === 'infos');
    expect(infos?.fields.map((f) => f.name)).toEqual(['Raison Sociale', 'ICE']);
  });

  it('puts unmatched fields under "Autres" without dropping any', () => {
    const groups = groupIssueFields([field('f1', 'customfield_99999', 'mystery value')]);
    const autres = groups.find((g) => g.id === 'autres');
    expect(autres?.fields).toEqual([field('f1', 'customfield_99999', 'mystery value')]);
  });

  it('never assigns the same field to two tabs', () => {
    const groups = groupIssueFields([field('f1', 'GSM', '0600000000')]);
    const totalOccurrences = groups.flatMap((g) => g.fields).filter((f) => f.id === 'f1').length;
    expect(totalOccurrences).toBe(1);
  });
});
