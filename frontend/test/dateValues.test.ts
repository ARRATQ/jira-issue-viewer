import { describe, it, expect } from 'vitest';
import { formatDisplayDate, isDateColumn, isoDatePart } from '../src/lib/dateValues';

describe('isoDatePart', () => {
  it('extracts the date of a Jira datetime without shifting the timezone', () => {
    expect(isoDatePart('2026-10-28T23:00:37.887+0100')).toBe('2026-10-28');
  });

  it('accepts a plain Jira date', () => {
    expect(isoDatePart('2026-10-28')).toBe('2026-10-28');
  });

  it('rejects values that are not ISO dates', () => {
    expect(isoDatePart('Acme')).toBeNull();
    expect(isoDatePart('28/10/2026')).toBeNull();
    expect(isoDatePart('2026-10-28 et plus')).toBeNull();
    expect(isoDatePart(null)).toBeNull();
  });
});

describe('formatDisplayDate', () => {
  it('formats an ISO datetime as a French date without time', () => {
    expect(formatDisplayDate('2026-10-28T23:00:37.887+0100')).toBe('28/10/2026');
  });

  it('returns non-date values unchanged', () => {
    expect(formatDisplayDate('Acme')).toBe('Acme');
  });
});

describe('isDateColumn', () => {
  const issue = (value: string | null) => ({
    key: 'K',
    summary: '',
    status: null,
    issueType: null,
    extraFields: { Created: value },
  });

  it('is true when every filled value is an ISO date', () => {
    expect(isDateColumn([issue('2026-10-28T23:00:37.887+0100'), issue(null), issue('2026-01-02')], 'Created')).toBe(
      true,
    );
  });

  it('is false when a value is not a date', () => {
    expect(isDateColumn([issue('2026-10-28'), issue('Acme')], 'Created')).toBe(false);
  });

  it('is false when the column is empty', () => {
    expect(isDateColumn([issue(null)], 'Created')).toBe(false);
  });
});
