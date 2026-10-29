import { describe, it, expect } from 'vitest';
import { formatFieldValue } from '../src/lib/formatFieldValue';

describe('formatFieldValue', () => {
  it('shows Jira dates without the time', () => {
    expect(formatFieldValue('2026-10-28T23:00:37.887+0100')).toBe('28/10/2026');
    expect(formatFieldValue('2026-10-28')).toBe('28/10/2026');
  });

  it('keeps other values as they are', () => {
    expect(formatFieldValue('Acme 2026-10-28')).toBe('Acme 2026-10-28');
    expect(formatFieldValue(['a', 'b'])).toBe('a, b');
    expect(formatFieldValue(true)).toBe('Oui');
    expect(formatFieldValue(42)).toBe('42');
  });
});
