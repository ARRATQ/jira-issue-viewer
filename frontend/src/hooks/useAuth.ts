import { useCallback, useSyncExternalStore } from 'react';
import { apiFetch } from '../lib/apiClient';
import { getAuth, setAuth, subscribe, type AuthUser } from '../lib/authStore';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export function useAuth() {
  const auth = useSyncExternalStore(subscribe, getAuth, getAuth);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const data = await apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  }, []);

  const logout = useCallback((): void => {
    setAuth(null);
  }, []);

  return {
    user: auth?.user ?? null,
    isAuthenticated: auth !== null,
    login,
    logout,
  };
}
