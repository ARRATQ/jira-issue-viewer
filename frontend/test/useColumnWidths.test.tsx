import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnWidths } from '../src/hooks/useColumnWidths';

const STORAGE_KEY = 'jira-issue-viewer.widths.u1.q1';

beforeEach(() => {
  localStorage.clear();
});

describe('useColumnWidths', () => {
  it('has no width when nothing is stored (automatic width)', () => {
    const { result } = renderHook(() => useColumnWidths('u1', 'q1'));
    expect(result.current.widths).toEqual({});
  });

  it('sets a width, rounds it and persists it', () => {
    const { result } = renderHook(() => useColumnWidths('u1', 'q1'));
    act(() => result.current.setWidth('summary', 240.6));

    expect(result.current.widths).toEqual({ summary: 241 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ summary: 241 });
  });

  it('clamps the width between 60 and 800 px', () => {
    const { result } = renderHook(() => useColumnWidths('u1', 'q1'));
    act(() => result.current.setWidth('key', 10));
    act(() => result.current.setWidth('summary', 5000));
    expect(result.current.widths).toEqual({ key: 60, summary: 800 });
  });

  it('resets one column back to the automatic width', () => {
    const { result } = renderHook(() => useColumnWidths('u1', 'q1'));
    act(() => result.current.setWidth('key', 100));
    act(() => result.current.setWidth('summary', 300));
    act(() => result.current.resetWidth('key'));

    expect(result.current.widths).toEqual({ summary: 300 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ summary: 300 });
  });

  it('restores the stored widths and drops invalid entries', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: 120, summary: 'large', status: 9999 }));
    const { result } = renderHook(() => useColumnWidths('u1', 'q1'));
    expect(result.current.widths).toEqual({ key: 120, status: 800 });
  });

  it('ignores a corrupted stored value', () => {
    localStorage.setItem(STORAGE_KEY, '[not json');
    const { result } = renderHook(() => useColumnWidths('u1', 'q1'));
    expect(result.current.widths).toEqual({});
  });

  it('keeps separate widths per query', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: 120 }));
    const { result, rerender } = renderHook(({ queryId }) => useColumnWidths('u1', queryId), {
      initialProps: { queryId: 'q1' },
    });
    expect(result.current.widths).toEqual({ key: 120 });

    rerender({ queryId: 'q2' });
    expect(result.current.widths).toEqual({});
  });
});
