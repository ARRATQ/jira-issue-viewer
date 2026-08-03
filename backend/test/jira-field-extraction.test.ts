import { describe, expect, it } from 'vitest';
import { extractFieldValue, extractPopulatedFields } from '../src/lib/jira';
import fieldCatalog from './fixtures/jira-field-catalog.json';
import issueDetail from './fixtures/jira-issue-detail.json';

describe('extractFieldValue', () => {
  it('passes through primitives unchanged', () => {
    expect(extractFieldValue('hello')).toBe('hello');
    expect(extractFieldValue(42)).toBe(42);
    expect(extractFieldValue(true)).toBe(true);
  });

  it('returns null for null/undefined', () => {
    expect(extractFieldValue(null)).toBeNull();
    expect(extractFieldValue(undefined)).toBeNull();
  });

  it('extracts .value, .displayName, or .name from objects, in that order', () => {
    expect(extractFieldValue({ value: 'Option A' })).toBe('Option A');
    expect(extractFieldValue({ displayName: 'Jane Doe' })).toBe('Jane Doe');
    expect(extractFieldValue({ name: 'In Progress' })).toBe('In Progress');
  });

  it('returns null for objects with none of the known keys', () => {
    expect(extractFieldValue({ foo: 'bar' })).toBeNull();
  });

  it('maps arrays recursively and drops null entries', () => {
    expect(extractFieldValue([{ value: 'A' }, { foo: 'bar' }, { value: 'B' }])).toEqual(['A', 'B']);
  });

  it('returns null for an array that extracts to nothing', () => {
    expect(extractFieldValue([{ foo: 'bar' }])).toBeNull();
  });
});

describe('extractPopulatedFields', () => {
  const fieldsMeta = new Map(fieldCatalog.map((f) => [f.id, f.name]));

  it('drops null, undefined, and empty-string fields', () => {
    const fields = extractPopulatedFields(issueDetail.fields, fieldsMeta);
    expect(fields.find((f) => f.id === 'customfield_10011')).toBeUndefined();
  });

  it('resolves readable names from the field catalog', () => {
    const fields = extractPopulatedFields(issueDetail.fields, fieldsMeta);
    const solution = fields.find((f) => f.id === 'customfield_10010');
    expect(solution).toMatchObject({ name: 'Solution Référencée', value: 'Solution X' });
  });

  it('falls back to the raw id when the field is not in the catalog', () => {
    const fields = extractPopulatedFields({ customfield_99999: 'mystery' }, fieldsMeta);
    expect(fields).toEqual([{ id: 'customfield_99999', name: 'customfield_99999', value: 'mystery' }]);
  });

  it('sorts fields alphabetically by resolved name', () => {
    const fields = extractPopulatedFields(issueDetail.fields, fieldsMeta);
    const names = fields.map((f) => f.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
