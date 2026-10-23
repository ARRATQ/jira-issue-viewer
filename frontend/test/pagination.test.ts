import { describe, it, expect } from 'vitest';
import { paginate } from '../src/lib/pagination';

const ITEMS = Array.from({ length: 53 }, (_, i) => i + 1);

describe('paginate', () => {
  it('returns the requested page slice with its 1-based range', () => {
    const result = paginate(ITEMS, 2, 25);
    expect(result.pageItems).toEqual(ITEMS.slice(25, 50));
    expect(result).toMatchObject({ page: 2, pageCount: 3, rangeStart: 26, rangeEnd: 50 });
  });

  it('returns a partial last page', () => {
    const result = paginate(ITEMS, 3, 25);
    expect(result.pageItems).toEqual([51, 52, 53]);
    expect(result).toMatchObject({ page: 3, rangeStart: 51, rangeEnd: 53 });
  });

  it('clamps a page beyond the end to the last page (e.g. after filtering)', () => {
    const result = paginate(ITEMS, 9, 25);
    expect(result.page).toBe(3);
    expect(result.pageItems).toEqual([51, 52, 53]);
  });

  it('clamps a page below 1 to the first page', () => {
    expect(paginate(ITEMS, 0, 25).page).toBe(1);
  });

  it('handles an empty list as a single empty page', () => {
    const result = paginate([], 1, 25);
    expect(result).toEqual({ pageItems: [], page: 1, pageCount: 1, rangeStart: 0, rangeEnd: 0 });
  });
});
