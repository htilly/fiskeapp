export type Weather = {
  temp: number; wind: number; windDir: number; pressure: number; cloud: number; code: number;
};
export type Catch = {
  id: string; lat: number; lng: number; caught_at: string; species: string;
  length_cm: number | null; weight_g: number | null; lure: string | null; note: string | null;
  lake_name: string | null; weather: Weather | null; has_photo: boolean; visibility: string;
};
export type User = { id: string; name: string };

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Något gick fel'), { status: res.status });
  return data as T;
}

export const api = {
  me: () => req<User>('GET', '/api/me'),
  post: <T>(url: string, body?: unknown) => req<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body: unknown) => req<T>('PATCH', url, body),
  del: <T>(url: string) => req<T>('DELETE', url),
  get: <T>(url: string) => req<T>('GET', url),
  logout: () => req<void>('POST', '/api/auth/logout', {}),
  catches: () => req<Catch[]>('GET', '/api/catches'),
  addCatch: (c: Partial<Catch>) => req<Catch>('POST', '/api/catches', c),
  deleteCatch: (id: string) => req<void>('DELETE', `/api/catches/${id}`),
  async uploadPhoto(id: string, file: Blob) {
    const fd = new FormData();
    fd.append('file', file, 'foto.jpg');
    const res = await fetch(`/api/catches/${id}/photo`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Kunde inte ladda upp bilden');
    return (await res.json()) as Catch;
  },
};
