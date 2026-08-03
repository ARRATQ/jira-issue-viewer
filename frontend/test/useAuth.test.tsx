import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuth } from '../src/hooks/useAuth';
import { setAuth } from '../src/lib/authStore';

vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../src/lib/apiClient';

beforeEach(() => {
  setAuth(null);
  vi.clearAllMocks();
});

describe('useAuth', () => {
  it('starts unauthenticated with no stored session', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('login stores the user and marks the session authenticated', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', email: 'a@example.com', name: 'A', role: 'USER' },
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('a@example.com', 'secret', true);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toMatchObject({ email: 'a@example.com', role: 'USER' });
  });

  it('logout clears the session', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', email: 'a@example.com', name: 'A', role: 'USER' },
    });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('a@example.com', 'secret', true);
    });
    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('propagates a login failure without changing the auth state', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Identifiants invalides'));
    const { result } = renderHook(() => useAuth());

    await expect(
      act(async () => {
        await result.current.login('a@example.com', 'wrong', true);
      }),
    ).rejects.toThrow('Identifiants invalides');

    expect(result.current.isAuthenticated).toBe(false);
  });
});
