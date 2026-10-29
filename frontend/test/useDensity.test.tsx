import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDensity } from '../src/hooks/useDensity';

const STORAGE_KEY = 'jira-issue-viewer.density.u1';

beforeEach(() => {
  localStorage.clear();
});

describe('useDensity', () => {
  it('is comfortable by default', () => {
    const { result } = renderHook(() => useDensity('u1'));
    expect(result.current.density).toBe('comfortable');
  });

  it('switches to compact and persists the choice', () => {
    const { result } = renderHook(() => useDensity('u1'));
    act(() => result.current.setDensity('compact'));
    expect(result.current.density).toBe('compact');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
  });

  it('restores the stored choice and ignores unknown values', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    expect(renderHook(() => useDensity('u1')).result.current.density).toBe('compact');

    localStorage.setItem(STORAGE_KEY, 'giant');
    expect(renderHook(() => useDensity('u1')).result.current.density).toBe('comfortable');
  });
});
