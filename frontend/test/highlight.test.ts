import { describe, it, expect } from 'vitest';
import { highlightRanges } from '../src/lib/highlight';

describe('highlightRanges', () => {
  it('finds every occurrence, ignoring case', () => {
    expect(highlightRanges('Acme acme', 'ACME')).toEqual([
      [0, 4],
      [5, 9],
    ]);
  });

  it('maps accent-insensitive matches back onto the original text', () => {
    const text = 'Société Générale';
    const ranges = highlightRanges(text, 'societe gen');
    expect(ranges).toEqual([[0, 11]]);
    expect(text.slice(0, 11)).toBe('Société Gén');
  });

  it('handles decomposed accents in the original text', () => {
    const text = 'Café noir';
    expect(highlightRanges(text, 'cafe')).toEqual([[0, 5]]);
  });

  it('returns nothing for a blank query or no match', () => {
    expect(highlightRanges('Acme', '  ')).toEqual([]);
    expect(highlightRanges('Acme', 'globex')).toEqual([]);
  });
});
