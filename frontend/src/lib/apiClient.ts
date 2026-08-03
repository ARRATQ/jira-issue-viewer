import { getAuth, setAccessToken, setAuth } from './authStore';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: string;
}

async function refreshAccessToken(): Promise<string | null> {
  const auth = getAuth();
  if (!auth) return null;

  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });

  if (!res.ok) {
    setAuth(null);
    return null;
  }

  const data = (await res.json()) as { accessToken: string };
  setAccessToken(data.accessToken);
  return data.accessToken;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody;
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// Requête JSON authentifiée : rejoue une fois la requête après un refresh de
// token en cas de 401, sinon lève une ApiError avec le message renvoyé par l'API.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = (token?: string) =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  const auth = getAuth();
  let res = await doFetch(auth?.accessToken);

  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doFetch(newToken);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Téléchargement de pièce jointe : même logique d'auth/refresh, renvoie un Blob.
export async function apiFetchBlob(path: string): Promise<Blob> {
  const doFetch = (token?: string) =>
    fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  const auth = getAuth();
  let res = await doFetch(auth?.accessToken);

  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doFetch(newToken);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }

  return res.blob();
}
