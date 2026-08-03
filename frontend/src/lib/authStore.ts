export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const STORAGE_KEY = 'jira-issue-viewer.auth';

type Listener = (auth: StoredAuth | null) => void;

const listeners = new Set<Listener>();

function readFromStorage(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

let current: StoredAuth | null = readFromStorage();

export function getAuth(): StoredAuth | null {
  return current;
}

export function setAuth(auth: StoredAuth | null): void {
  current = auth;
  if (auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  for (const listener of listeners) listener(current);
}

export function setAccessToken(accessToken: string): void {
  if (!current) return;
  setAuth({ ...current, accessToken });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
